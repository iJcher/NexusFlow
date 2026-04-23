import { Module } from '@nestjs/common';
import { FlowRuntimeService } from './flow-runtime.service';
import { LlmProviderModule } from '../llm-provider/llm-provider.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [LlmProviderModule, KnowledgeModule],
  providers: [FlowRuntimeService],
  exports: [FlowRuntimeService],
})
export class WorkflowModule {}
