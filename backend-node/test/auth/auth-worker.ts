import 'reflect-metadata';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuthModule } from '../../src/auth/auth.module';
import { AuthService } from '../../src/auth/auth.service';
import { JwtAuthGuard } from '../../src/auth/jwt-auth.guard';
import { configureApplication } from '../../src/bootstrap';
import { assertSingleUse } from './assertions';

async function start() {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      AuthModule,
    ],
    providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
  })
    .overrideProvider(ConfigService)
    .useValue(new ConfigService({ ...process.env }))
    .compile();
  const app = module.createNestApplication({ logger: false });
  const observed: number[] = [];
  // Deliberate mutation is confined to a disposable test process, never business source.
  if (process.env.P00_TEST_REPEAT_CONSUMPTION === 'true') {
    const auth = app.get(AuthService);
    const original = auth.login.bind(auth);
    const cache = new Map<string, Awaited<ReturnType<AuthService['login']>>>();
    auth.login = async (dto, ip) => {
      const cached = cache.get(dto.challengeId);
      if (cached) return cached;
      const value = await original(dto, ip);
      cache.set(dto.challengeId, value);
      return value;
    };
    app.use(
      (
        req: { url: string },
        res: {
          statusCode: number;
          on(event: string, callback: () => void): void;
        },
        next: () => void,
      ) => {
        if (req.url === '/auth/email/login')
          res.on('finish', () => observed.push(res.statusCode));
        next();
      },
    );
  }
  configureApplication(app);
  await app.listen(0, '127.0.0.1');
  process.send?.({ type: 'ready', url: await app.getUrl() });
  process.on('message', (message: { type?: string }) => {
    if (message?.type !== 'assert-single-use') return;
    try {
      assertSingleUse(observed);
      process.exitCode = 0;
    } catch {
      // No OTP/token/body/header in diagnostic output.
      process.send?.({ type: 'mutation-detected' });
      process.exitCode = 2;
    }
    void app.close().finally(() => process.exit(process.exitCode));
  });
}

void start().catch(() => {
  process.send?.({ type: 'startup-failed' });
  process.exit(3);
});
