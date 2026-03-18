import { Controller, Post, Param, Body, Res, Headers } from '@nestjs/common';
import { FlowRuntimeService } from './flow-runtime.service';
import { Public } from '../auth/public.decorator';

@Controller('Flow')
export class FlowAIController {
  constructor(private flowRuntimeService: FlowRuntimeService) {}

  @Post('chat-messages/:flowId')
  @Public()
  async chatStream(
    @Param('flowId') flowId: string,
    @Body() body: any,
    @Res() res: any,
    @Headers('phoneNumber') phoneNumber: string,
  ) {
    const request = {
      query: body.query || '',
      user: phoneNumber || body.user || '',
      conversationId: body.conversation_id || body.conversationId,
      responseMode: body.response_mode || 'streaming',
      inputs: body.inputs || {},
      files: body.files || [],
    };

    await this.flowRuntimeService.runFlowStreaming(BigInt(flowId), request, res);
  }
}
