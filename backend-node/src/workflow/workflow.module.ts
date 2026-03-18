import { Module } from '@nestjs/common';
import { FlowRuntimeService } from './flow-runtime.service';
import { LlmProviderModule } from '../llm-provider/llm-provider.module';

@Module({
  imports: [LlmProviderModule],
  providers: [FlowRuntimeService],
  exports: [FlowRuntimeService],
})
export class WorkflowModule {}
