import { Controller, Post, Param, Body, Res } from '@nestjs/common';
import { FlowRuntimeService } from './flow-runtime.service';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator';

@Controller('Flow')
export class FlowAIController {
  constructor(private flowRuntimeService: FlowRuntimeService) {}

  @Post('chat-messages/:flowId')
  async chatStream(
    @Param('flowId') flowId: string,
    @Body() body: any,
    @Res() res: any,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const request = {
      query: body.query || '',
      user: user.phoneNumber || user.id,
      conversationId: body.conversation_id || body.conversationId,
      responseMode: body.response_mode || 'streaming',
      inputs: body.inputs || {},
      files: body.files || [],
    };

    await this.flowRuntimeService.runFlowStreaming(BigInt(flowId), user.id, request, res);
  }
}
