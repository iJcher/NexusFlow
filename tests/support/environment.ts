// Public, dedicated test secrets. Never use these in deployed environments.
export const acceptanceEnvironment: Record<string, string> = {
  NODE_ENV: 'test', PORT: '31050', CI: 'true',
  CONNECTION_ACTIVE_KEY_ID: 'test-acceptance',
  CONNECTION_ENCRYPTION_KEYS: JSON.stringify({ 'test-acceptance': Buffer.alloc(32, 37).toString('base64') }),
  DATABASE_URL: 'postgresql://nexus_test:nexus_test_only@127.0.0.1:15432/nexus_test?schema=public',
  REDIS_URL: 'redis://127.0.0.1:16379',
  JWT_SECRET: 'nexus-p00-only-jwt-secret-not-for-deployment-2026',
  AUTH_JWT_SECRET: 'nexus-p00-email-signing-key-not-for-deployment-2026',
  AUTH_EMAIL_CODE_PEPPER: 'nexus-p00-only-pepper-not-for-deployment-2026',
  AUTH_REDIS_PREFIX: 'nf:p00:', AUTH_ACCESS_TTL_SECONDS: '900', AUTH_REFRESH_TTL_SECONDS: '604800',
  AUTH_ALLOWED_ORIGINS: 'http://127.0.0.1:5175,http://localhost:5175',
  AUTH_EMAIL_CODE_TTL_SECONDS: '600', AUTH_EMAIL_CODE_COOLDOWN_SECONDS: '60',
  AUTH_EMAIL_CODE_MAX_ATTEMPTS: '5', SMTP_HOST: '127.0.0.1', SMTP_PORT: '11025',
  SMTP_SECURE: 'false', SMTP_ALLOW_INSECURE: 'true',
  SMTP_USER: '', SMTP_PASSWORD: '',
  SMTP_FROM: 'Nexus Acceptance <no-reply@nexus.test>',
  SMTP_TIMEOUT_MS: '3000',
  VITE_API_BASE_URL: '/api', VITE_PROXY_TARGET: 'http://127.0.0.1:31050',
  VITE_PROXY_STRIP_PREFIX: 'true', P00_API_URL: 'http://127.0.0.1:31050',
  P00_UI_URL: 'http://127.0.0.1:5175', P00_MAILPIT_URL: 'http://127.0.0.1:18025',
};

export function assertIsolatedEnvironment(env: Record<string, string | undefined>) {
  const db = new URL(env.DATABASE_URL ?? '');
  const redis = new URL(env.REDIS_URL ?? '');
  if (env.NODE_ENV !== 'test' || db.hostname !== '127.0.0.1' || db.port !== '15432'
    || db.pathname !== '/nexus_test' || redis.hostname !== '127.0.0.1' || redis.port !== '16379') {
    throw new Error('Acceptance refuses non-isolated database/Redis targets');
  }
}
