import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowCompiler } from './compiler';
import { RunsRepository } from './repository';
import { RunsController, VersionsController } from './runs.controller';
@Module({
  imports: [PrismaModule],
  providers: [WorkflowCompiler, RunsRepository],
  controllers: [RunsController, VersionsController],
  exports: [WorkflowCompiler, RunsRepository],
})
export class RunsModule {}
