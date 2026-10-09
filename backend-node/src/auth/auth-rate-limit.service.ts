import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import Redis from 'ioredis';
import { AuthConfig } from './auth.config';
import { authError } from './auth.errors';

// Check every limit before consuming any counter, atomically across API instances.
const LIMIT_SCRIPT = [
  'for i,key in ipairs(KEYS) do',
  ' local count=tonumber(redis.call("GET",key) or "0")',
  ' if count >= tonumber(ARGV[(i-1)*2+1]) then',
  '  return {0, math.max(1,redis.call("PTTL",key))}',
  ' end',
  'end',
  'for i,key in ipairs(KEYS) do',
  ' local count=redis.call("INCR",key)',
  ' if count==1 then redis.call("PEXPIRE",key,ARGV[(i-1)*2+2]) end',
  'end',
  'return {1,0}',
].join('\n');

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;
  constructor(private readonly config: AuthConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 3000,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.redis.on('error', () => undefined); // No credentials/connection URLs in logs.
  }

  async consume(
    kind: 'send' | 'verify' | 'refresh',
    email: string,
    ip: string,
  ): Promise<void> {
    const hash = (value: string) =>
      createHash('sha256').update(value).digest('hex');
    const limits =
      kind === 'send'
        ? ([
            [
              'email:' + hash(email),
              this.config.integer('AUTH_SEND_EMAIL_LIMIT', 5, 1, 100),
              3600000,
            ],
            [
              'ip:' + hash(ip),
              this.config.integer('AUTH_SEND_IP_LIMIT', 30, 1, 1000),
              600000,
            ],
            [
              'global',
              this.config.integer('AUTH_SEND_GLOBAL_LIMIT', 1000, 1, 100000),
              3600000,
            ],
          ] as const)
        : ([
            [
              'email:' + hash(email),
              this.config.integer('AUTH_VERIFY_EMAIL_LIMIT', 20, 1, 1000),
              900000,
            ],
            [
              'ip:' + hash(ip),
              this.config.integer('AUTH_VERIFY_IP_LIMIT', 200, 1, 10000),
              900000,
            ],
          ] as const);
    try {
      const keys = limits.map(
        ([name]) => this.config.redisPrefix + kind + ':' + name,
      );
      const args = limits.flatMap(([, max, ttl]) => [String(max), String(ttl)]);
      const result = (await this.redis.eval(
        LIMIT_SCRIPT,
        keys.length,
        ...keys,
        ...args,
      )) as [number, number];
      if (result[0] !== 1) {
        throw authError(
          429,
          'AUTH_RATE_LIMITED',
          '请求过于频繁，请稍后重试',
          Math.ceil(result[1] / 1000),
        );
      }
    } catch (error) {
      if (error instanceof Error && 'getStatus' in error) throw error;
      throw authError(
        503,
        'AUTH_RATE_LIMIT_UNAVAILABLE',
        '登录服务暂不可用，请稍后重试',
      );
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
