import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { RunWorkerModule } from './runs/worker.module';
async function start(): Promise<void> {
  const app = await NestFactory.createApplicationContext(RunWorkerModule, {
    logger: ['error', 'warn', 'log'],
  });
  app.enableShutdownHooks();
}
void start().catch(() => {
  console.error(
    'RUN_WORKER_STARTUP_FAILED: check database/queue configuration',
  );
  process.exitCode = 1;
});
