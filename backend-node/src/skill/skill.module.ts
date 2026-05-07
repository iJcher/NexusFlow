import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LlmProviderModule } from '../llm-provider/llm-provider.module';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

@Module({
  imports: [PrismaModule, LlmProviderModule],
  controllers: [SkillController],
  providers: [SkillService],
})
export class SkillModule {}
