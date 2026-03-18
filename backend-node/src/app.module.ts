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
import { FlowAIController } from './workflow/flow-ai.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    FlowModule,
    LlmProviderModule,
    WorkflowModule,
    ConversationModule,
  ],
  controllers: [FlowAIController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
