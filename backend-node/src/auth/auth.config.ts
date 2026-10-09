import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthConfig {
  readonly signingKey: string;
  readonly pepper: string;
  readonly issuer = 'nexusflow-email-auth';
  readonly audience = 'nexusflow-api';
  readonly origins: string[];
  readonly production: boolean;
  readonly codeTtl: number;
  readonly cooldown: number;
  readonly maxAttempts: number;
  readonly accessTtl: number;
  readonly refreshTtl: number;
  readonly redisUrl: string;
  readonly redisPrefix: string;

  constructor(readonly env: ConfigService) {
    this.production = env.get<string>('NODE_ENV') === 'production';
    this.signingKey = this.required('AUTH_JWT_SECRET', 32);
    this.pepper = this.required('AUTH_EMAIL_CODE_PEPPER', 32);
    if (
      this.signingKey === this.pepper ||
      this.signingKey === env.get<string>('JWT_SECRET')
    ) {
      throw new Error(
        'Auth signing key must be independent and rotated from the legacy key',
      );
    }
    this.origins = this.required('AUTH_ALLOWED_ORIGINS')
      .split(',')
      .map((x) => x.trim());
    for (const origin of this.origins) {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        (url.protocol !== 'https:' && url.protocol !== 'http:') ||
        (this.production && url.protocol !== 'https:')
      ) {
        throw new Error(
          'AUTH_ALLOWED_ORIGINS must contain exact trusted origins',
        );
      }
    }
    this.codeTtl = this.integer('AUTH_EMAIL_CODE_TTL_SECONDS', 600, 30, 1800);
    this.cooldown = this.integer(
      'AUTH_EMAIL_CODE_COOLDOWN_SECONDS',
      60,
      1,
      3600,
    );
    this.maxAttempts = this.integer('AUTH_EMAIL_CODE_MAX_ATTEMPTS', 5, 1, 10);
    this.accessTtl = this.integer('AUTH_ACCESS_TTL_SECONDS', 900, 30, 3600);
    this.refreshTtl = this.integer(
      'AUTH_REFRESH_TTL_SECONDS',
      604800,
      300,
      2592000,
    );
    this.redisUrl = this.required('REDIS_URL');
    this.redisPrefix = env.get<string>('AUTH_REDIS_PREFIX') || 'nf:auth:';
  }

  required(name: string, minLength = 1): string {
    const value = this.env.get<string>(name)?.trim();
    if (!value || value.length < minLength)
      throw new Error(name + ' is required');
    return value;
  }

  integer(name: string, fallback: number, min: number, max: number): number {
    const raw = this.env.get<string>(name);
    const value = raw === undefined || raw === '' ? fallback : Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(name + ' is outside the supported range');
    }
    return value;
  }
}
