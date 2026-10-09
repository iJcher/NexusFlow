import { PrismaClient } from '@prisma/client';
import { SecretVault } from '../src/security/secret-vault';
import { migrateConnectionSecrets } from '../src/security/secret-migration';

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some((arg) => !['--apply', '--dry-run'].includes(arg)) ||
    args.length > 1
  )
    throw new Error('Usage: migrate-connection-secrets --dry-run|--apply');
  const vault = new SecretVault();
  const prisma = new PrismaClient();
  try {
    const result = await migrateConnectionSecrets(prisma, vault, {
      dryRun: !args.includes('--apply'),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.conflicts > 0) process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}
void main().catch(() => {
  process.stderr.write('CONNECTION_SECRET_MIGRATION_FAILED\n');
  process.exitCode = 1;
});
