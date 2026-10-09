import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthConfig } from './auth/auth.config';
import { randomUUID } from 'node:crypto';

@Catch()
class SafeHttpExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : null;
    const body =
      detail && typeof detail === 'object'
        ? (detail as {
            message?: string | string[];
            code?: string;
            retryAfter?: number;
          })
        : {};
    const message =
      typeof body.message === 'string'
        ? body.message
        : status === 400
          ? '请求参数不合法'
          : status === 500
            ? '服务暂不可用'
            : '请求未获授权';
    if (body.retryAfter !== undefined)
      res.setHeader('Retry-After', body.retryAfter);
    res.setHeader('Cache-Control', 'no-store');
    res.status(status).json({
      errCode: status,
      errMsg: message,
      code: body.code || 'HTTP_' + status,
      requestId: randomUUID(),
      ...(body.retryAfter !== undefined ? { retryAfter: body.retryAfter } : {}),
    });
  }
}

export function configureApplication(app: INestApplication): void {
  const config = app.get(AuthConfig);
  // Do not trust arbitrary forwarded IPs. Enable only an explicitly vetted proxy topology.
  const proxy = config.env.get<string>('TRUSTED_PROXY_CIDRS');
  const expressApp = app.getHttpAdapter().getInstance() as {
    set(key: string, value: unknown): void;
  };
  expressApp.set(
    'trust proxy',
    proxy ? proxy.split(',').map((x) => x.trim()) : false,
  );
  app.enableCors({
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new SafeHttpExceptionFilter());
  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
}
