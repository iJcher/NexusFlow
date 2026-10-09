import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { RunWorkerModule } from '../../src/runs/worker.module';
import { HttpEffectExecutor } from '../../src/runs/http-effect.executor';
import {
  ExecutionContext,
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
} from '../../src/runs/contracts';
import { isolated } from './fixtures';

// Adapter only exists inside this disposable test process. Production SSRF policy is not altered.
class TestLoopbackHttpExecutor {
  async execute(
    spec: NodeSpec,
    inputs: JsonObject,
    context: ExecutionContext,
  ): Promise<Json> {
    const fixtureBase = new URL(
      process.env.P02_HTTP_FIXTURE_URL || 'http://127.0.0.1:1',
    );
    if (
      typeof spec.config?.url !== 'string' ||
      typeof spec.config?.method !== 'string'
    ) {
      throw new ExecutionError('TEST_FIXTURE_CONFIG_REJECTED');
    }
    const logicalUrl = new URL(spec.config.url);
    if (
      fixtureBase.hostname !== '127.0.0.1' ||
      logicalUrl.protocol !== 'https:' ||
      logicalUrl.hostname !== 'fixture.nexus.test'
    ) {
      throw new ExecutionError('TEST_FIXTURE_TARGET_REJECTED');
    }
    const method = spec.config.method;
    if (!['GET', 'POST'].includes(method))
      throw new ExecutionError('TEST_FIXTURE_METHOD_REJECTED');
    const target = new URL(
      logicalUrl.pathname + logicalUrl.search,
      fixtureBase,
    );
    try {
      const response = await fetch(target, {
        method,
        signal: context.signal,
        headers: {
          'content-type': 'application/json',
          'idempotency-key': context.operationKey,
        },
        ...(method === 'POST' ? { body: JSON.stringify(inputs) } : {}),
      });
      if (!response.ok)
        throw new ExecutionError(
          'HTTP_STATUS',
          method === 'GET',
          method === 'POST',
        );
      return (await response.json()) as Json;
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      throw new ExecutionError(
        'HTTP_RESPONSE_LOST',
        method === 'GET',
        method === 'POST',
      );
    }
  }
}
async function start(): Promise<void> {
  isolated();
  const module = await Test.createTestingModule({ imports: [RunWorkerModule] })
    .overrideProvider(HttpEffectExecutor)
    .useClass(TestLoopbackHttpExecutor)
    .compile();
  await module.init();
  process.send?.({ type: 'ready' });
  process.on('message', (request: { type: string }) => {
    if (request.type === 'stop')
      void module.close().finally(() => process.exit(0));
  });
}
void start().catch((error) => {
  process.stderr.write(
    error instanceof Error ? error.message + '\n' : 'Worker startup failure\n',
  );
  process.send?.({ type: 'startup-failed' });
  process.exit(3);
});
