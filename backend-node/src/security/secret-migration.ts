import {
  PrismaClient,
  FlowLLMProviderEntity,
  McpServerEntity,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { SecretVault, connectionSecretContext } from './secret-vault';
import { parseJson } from '../common/json.util';

export async function migrateConnectionSecrets(
  prisma: PrismaClient,
  vault: SecretVault,
  options: { dryRun?: boolean; batchSize?: number; ownerUserId?: bigint } = {},
) {
  const dryRun = options.dryRun !== false;
  const batchSize = options.batchSize ?? 100;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000)
    throw new Error('INVALID_SECRET_MIGRATION_BATCH');
  const result = {
    dryRun,
    scanned: 0,
    migrated: 0,
    pending: 0,
    unchanged: 0,
    conflicts: 0,
    ciphertextSha256: '',
  };
  const digest = createHash('sha256');
  let cursor: bigint | undefined;
  while (true) {
    const rows: FlowLLMProviderEntity[] =
      await prisma.flowLLMProviderEntity.findMany({
        where: {
          ...(options.ownerUserId !== undefined
            ? { ownerUserId: options.ownerUserId }
            : {}),
          ...(cursor !== undefined ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take: batchSize,
      });
    if (!rows.length) break;
    for (const row of rows) {
      result.scanned++;
      const context = connectionSecretContext(
        'provider',
        row.id,
        row.ownerUserId,
        'apiKey',
      );
      if (vault.isSealed(row.llmAPIKey)) {
        vault.open(row.llmAPIKey, context);
        result.unchanged++;
        digest.update(row.llmAPIKey);
        continue;
      }
      result.pending++;
      if (dryRun) continue;
      const sealed = vault.seal(row.llmAPIKey, context);
      const updated = await prisma.flowLLMProviderEntity.updateMany({
        where: {
          id: row.id,
          ownerUserId: row.ownerUserId,
          llmAPIKey: row.llmAPIKey,
        },
        data: { llmAPIKey: sealed },
      });
      if (updated.count) {
        result.migrated++;
        digest.update(sealed);
      } else result.conflicts++;
    }
    cursor = rows[rows.length - 1].id;
  }
  cursor = undefined;
  while (true) {
    const rows: McpServerEntity[] = await prisma.mcpServerEntity.findMany({
      where: {
        ...(options.ownerUserId !== undefined
          ? { ownerUserId: options.ownerUserId }
          : {}),
        ...(cursor !== undefined ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (!rows.length) break;
    for (const row of rows) {
      result.scanned++;
      const values: { env: string; headers: string } = {
        env: row.env,
        headers: row.headers,
      };
      let pending = false;
      for (const field of ['env', 'headers'] as const) {
        const context = connectionSecretContext(
          'mcp',
          row.id,
          row.ownerUserId,
          field,
        );
        const sealed = vault.isSealed(row[field]);
        const decoded = parseJson(
          sealed ? vault.open(row[field], context) : row[field],
        );
        if (
          !decoded ||
          typeof decoded !== 'object' ||
          Array.isArray(decoded) ||
          Object.values(decoded).some((value) => typeof value !== 'string')
        )
          throw new Error('INVALID_CONNECTION_SECRET_OBJECT');
        if (!sealed) {
          pending = true;
          if (!dryRun)
            values[field] = vault.seal(JSON.stringify(decoded), context);
        }
      }
      if (!pending) {
        result.unchanged++;
        digest.update(row.env).update(row.headers);
        continue;
      }
      result.pending++;
      if (dryRun) continue;
      const updated = await prisma.mcpServerEntity.updateMany({
        where: {
          id: row.id,
          ownerUserId: row.ownerUserId,
          env: row.env,
          headers: row.headers,
        },
        data: values,
      });
      if (updated.count) {
        result.migrated++;
        digest.update(values.env).update(values.headers);
      } else result.conflicts++;
    }
    cursor = rows[rows.length - 1].id;
  }
  result.ciphertextSha256 = digest.digest('hex');
  return result;
}
