import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkflowCompiler } from './compiler';
import { RunsRepository } from './repository';
import { NodeRegistry } from './node-registry';
import { HttpEffectExecutor } from './http-effect.executor';
import { WorkerRuntime } from './worker-runtime';
import { ContainerJsExecutor } from './container-js.executor';
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
  providers: [
    WorkflowCompiler,
    RunsRepository,
    NodeRegistry,
    HttpEffectExecutor,
    WorkerRuntime,
    ContainerJsExecutor,
  ],
  exports: [RunsRepository, NodeRegistry, WorkerRuntime],
})
export class RunWorkerModule {}
