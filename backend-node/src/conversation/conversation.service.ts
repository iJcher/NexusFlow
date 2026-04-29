import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private prisma: PrismaService) {}

  async getLocalConversations(flowId: bigint, userId: string, firstId?: string, limit = 20) {
    const ownerUserId = BigInt(userId);
    let cursor: Date | undefined;
    if (firstId) {
      const first = await this.prisma.flowChatConversationEntity.findUnique({
        where: { conversationId: firstId },
      });
      if (first) cursor = first.updatedAt;
    }

    const where: any = { ownerUserId, flowId };
    if (cursor) where.updatedAt = { lt: cursor };

    const conversations = await this.prisma.flowChatConversationEntity.findMany({
      where,
      orderBy: [{ isTop: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    return {
      data: conversations.map((c) => ({
        id: c.conversationId,
        title: c.title,
        isTop: c.isTop,
        lastMessageTime: c.updatedAt,
        messageCount: c.messageCount,
      })),
      hasMore: conversations.length === limit,
      limit,
    };
  }

  async getLocalMessages(flowId: bigint, userId: string, conversationId: string, firstId?: string, limit = 20) {
    const ownerUserId = BigInt(userId);
    const where: any = { conversationId, ownerUserId, flowId };
    if (firstId) where.id = { lt: BigInt(firstId) };

    const messages = await this.prisma.flowChatMessageEntity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return {
      data: messages.map((m) => ({
        id: m.id.toString(),
        conversationId: m.conversationId,
        question: m.question,
        answer: m.answer,
        files: m.files ? JSON.parse(m.files) : [],
        createdAt: m.createdAt,
        totalTokens: m.totalTokens,
      })),
      hasMore: messages.length === limit,
      limit,
    };
  }

  async toggleTop(flowId: bigint, userId: string, conversationId: string) {
    const ownerUserId = BigInt(userId);
    const conv = await this.prisma.flowChatConversationEntity.findFirst({
      where: { conversationId, ownerUserId, flowId },
    });
    if (!conv) return null;

    const newTop = !conv.isTop;
    await this.prisma.flowChatConversationEntity.update({
      where: { conversationId },
      data: { isTop: newTop, updatedAt: new Date() },
    });
    return { success: true, isTop: newTop };
  }

  async updateTitle(flowId: bigint, userId: string, conversationId: string, title: string) {
    const result = await this.prisma.flowChatConversationEntity.updateMany({
      where: { conversationId, ownerUserId: BigInt(userId), flowId },
      data: { title, updatedAt: new Date() },
    });
    return result.count > 0;
  }

  async deleteConversation(flowId: bigint, userId: string, conversationId: string) {
    const ownerUserId = BigInt(userId);
    const deletedMessages = await this.prisma.flowChatMessageEntity.deleteMany({
      where: { conversationId, ownerUserId, flowId },
    });
    const deletedConv = await this.prisma.flowChatConversationEntity.deleteMany({
      where: { conversationId, ownerUserId, flowId },
    });
    if (deletedConv.count === 0) return null;
    return { deletedMessages: deletedMessages.count };
  }
}
