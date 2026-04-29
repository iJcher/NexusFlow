import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { FlowModule } from './flow/flow.module';
import { LlmProviderModule } from './llm-provider/llm-provider.module';
import { WorkflowModule } from './workflow/workflow.module';
import { ConversationModule } from './conversation/conversation.module';
import { TemplateModule } from './template/template.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { FlowAIController } from './workflow/flow-ai.controller';
import { HealthController } from './health.controller';
import { SkillModule } from './skill/skill.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    FlowModule,
    LlmProviderModule,
    WorkflowModule,
    ConversationModule,
    TemplateModule,
    KnowledgeModule,
    SkillModule,
    McpModule,
  ],
  controllers: [FlowAIController, HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
