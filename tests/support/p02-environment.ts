import { acceptanceEnvironment } from './environment.js';

export const p02Environment: Record<string, string> = {
  ...acceptanceEnvironment,
  NODE_ENV: 'test', CI: 'true',
  WORKFLOW_REDIS_URL: 'redis://127.0.0.1:16380',
  WORKFLOW_QUEUE_NAME: 'nf-p02', WORKFLOW_QUEUE_PREFIX: 'nf-p02',
  RUN_WORKER_CONCURRENCY: '4', RUN_LEASE_MS: '1000', RUN_RECOVERY_INTERVAL_MS: '100',
};

export function assertP02Environment(environment: Record<string, string | undefined>) {
  const db = new URL(environment.DATABASE_URL ?? '');
  const queue = new URL(environment.WORKFLOW_REDIS_URL ?? '');
  if (environment.NODE_ENV !== 'test' || db.hostname !== '127.0.0.1' || db.port !== '15432'
    || db.pathname !== '/nexus_test' || queue.hostname !== '127.0.0.1' || queue.port !== '16380'
    || environment.WORKFLOW_REDIS_URL === environment.REDIS_URL) {
    throw new Error('P02 acceptance refuses non-isolated DB or shared queue/cache Redis');
  }
}
