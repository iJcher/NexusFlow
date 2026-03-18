import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationService {
  constructor(private prisma: PrismaService) {}

  async getLocalConversations(flowId: bigint, user: string, firstId?: string, limit = 20) {
    let cursor: Date | undefined;
    if (firstId) {
      const first = await this.prisma.flowChatConversationEntity.findUnique({
        where: { conversationId: firstId },
      });
      if (first) cursor = first.updatedAt;
    }

    const where: any = { user, flowId };
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

  async getLocalMessages(flowId: bigint, user: string, conversationId: string, firstId?: string, limit = 20) {
    const where: any = { conversationId, user, flowId };
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

  async toggleTop(flowId: bigint, user: string, conversationId: string) {
    const conv = await this.prisma.flowChatConversationEntity.findFirst({
      where: { conversationId, user, flowId },
    });
    if (!conv) return null;

    const newTop = !conv.isTop;
    await this.prisma.flowChatConversationEntity.update({
      where: { conversationId },
      data: { isTop: newTop, updatedAt: new Date() },
    });
    return { success: true, isTop: newTop };
  }

  async updateTitle(flowId: bigint, user: string, conversationId: string, title: string) {
    const result = await this.prisma.flowChatConversationEntity.updateMany({
      where: { conversationId, user, flowId },
      data: { title, updatedAt: new Date() },
    });
    return result.count > 0;
  }

  async deleteConversation(flowId: bigint, user: string, conversationId: string) {
    const deletedMessages = await this.prisma.flowChatMessageEntity.deleteMany({
      where: { conversationId, user, flowId },
    });
    const deletedConv = await this.prisma.flowChatConversationEntity.deleteMany({
      where: { conversationId, user, flowId },
    });
    if (deletedConv.count === 0) return null;
    return { deletedMessages: deletedMessages.count };
  }
}
