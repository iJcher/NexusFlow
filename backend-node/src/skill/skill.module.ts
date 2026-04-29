import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SkillController } from './skill.controller';
import { SkillService } from './skill.service';

@Module({
  imports: [PrismaModule],
  controllers: [SkillController],
  providers: [SkillService],
})
export class SkillModule {}
