import { Controller, Get, Post, Param, Query, Body, Headers } from '@nestjs/common';
import { ConversationService } from './conversation.service';

@Controller('FlowConversation')
export class ConversationController {
  constructor(private conversationService: ConversationService) {}

  @Get(':flowId/local-conversations')
  async getLocalConversations(
    @Param('flowId') flowId: string,
    @Headers('phoneNumber') user: string,
    @Query('first_id') firstId?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.conversationService.getLocalConversations(
      BigInt(flowId),
      user,
      firstId,
      Number(limit || 20),
    );
    return { errCode: 0, errMsg: '', data: result };
  }

  @Get(':flowId/local-messages')
  async getLocalMessages(
    @Param('flowId') flowId: string,
    @Headers('phoneNumber') user: string,
    @Query('conversation_id') conversationId: string,
    @Query('first_id') firstId?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.conversationService.getLocalMessages(
      BigInt(flowId),
      user,
      conversationId,
      firstId,
      Number(limit || 20),
    );
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post(':flowId/local-conversations-toggle-top')
  async toggleTop(
    @Param('flowId') flowId: string,
    @Headers('phoneNumber') user: string,
    @Query('conversationId') conversationId: string,
  ) {
    const result = await this.conversationService.toggleTop(BigInt(flowId), user, conversationId);
    if (!result) return { errCode: 1, errMsg: 'conversation not found' };
    return { errCode: 0, errMsg: '', data: result };
  }

  @Post(':flowId/local-conversations-update-title')
  async updateTitle(
    @Param('flowId') flowId: string,
    @Headers('phoneNumber') user: string,
    @Query('conversationId') conversationId: string,
    @Body() body: { title: string },
  ) {
    const ok = await this.conversationService.updateTitle(BigInt(flowId), user, conversationId, body.title);
    if (!ok) return { errCode: 1, errMsg: 'conversation not found' };
    return { errCode: 0, errMsg: '', data: { success: true } };
  }

  @Post(':flowId/local-conversations-delete')
  async deleteConversation(
    @Param('flowId') flowId: string,
    @Headers('phoneNumber') user: string,
    @Query('conversationId') conversationId: string,
  ) {
    const result = await this.conversationService.deleteConversation(BigInt(flowId), user, conversationId);
    if (!result) return { errCode: 1, errMsg: 'conversation not found' };
    return { errCode: 0, errMsg: '', data: { success: true, ...result } };
  }
}
