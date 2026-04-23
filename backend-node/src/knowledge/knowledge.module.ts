import { Module } from '@nestjs/common';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { EmbeddingService } from './embedding.service';
import { ChunkingService } from './chunking.service';
import { LlmProviderModule } from '../llm-provider/llm-provider.module';

@Module({
  imports: [LlmProviderModule],
  controllers: [KnowledgeController],
  providers: [KnowledgeService, EmbeddingService, ChunkingService],
  exports: [KnowledgeService, EmbeddingService],
})
export class KnowledgeModule {}
