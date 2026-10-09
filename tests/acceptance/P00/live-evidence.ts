import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Source = { path: string; sha256: string };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

// Test/gate/document changes cannot invalidate already observed inbox delivery.
// Runtime, migrations and dependency changes do: re-review is then required.
export function liveSourceScope(path: string): boolean {
  return /^(backend-node\/(src|prisma)\/|front\/src\/)/.test(path)
    || /^(backend-node\/|front\/)?(package\.json|pnpm-lock\.yaml)$/.test(path)
    || path === 'tests/acceptance/P00/live-email-smoke.ts';
}

async function boundedFile(path: string): Promise<Buffer> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65_536)
    throw new Error('LIVE evidence must be a bounded regular file');
  const bytes = await readFile(path);
  if (bytes.length > 65_536) throw new Error('LIVE evidence exceeds size limit');
  return bytes;
}

export async function verifyLiveEvidence(directory: string, currentManifest: Source[], now = Date.now()) {
  const directoryStat = await lstat(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('LIVE directory must not be a symbolic link');
  const bytes = await boundedFile(join(directory, 'live-email.json'));
  const provenanceBytes = await boundedFile(join(directory, 'provenance.json'));
  const evidence: unknown = JSON.parse(bytes.toString('utf8'));
  const provenance: unknown = JSON.parse(provenanceBytes.toString('utf8'));
  const keys = ['caseId', 'status', 'mode', 'recipientHash', 'sentAt', 'receivedAt', 'authenticatedAt', 'loggedOut', 'messageIdSha256', 'note'];
  if (!object(evidence) || Object.keys(evidence).length !== keys.length || keys.some(key => !(key in evidence))
    || evidence.caseId !== 'P00-AUTH-LIVE' || evidence.status !== 'PASS'
    || evidence.mode !== 'manual-real-inbox-plus-automated-login' || evidence.loggedOut !== true
    || !digest(evidence.recipientHash) || !digest(evidence.messageIdSha256)
    || evidence.note !== 'Inbox receipt has a manual step; code/token/cookie are not retained. This is not an automated inbox-reader claim.')
    throw new Error('LIVE evidence schema/receipt/session verification is invalid');
  const timestamps = ['sentAt', 'receivedAt', 'authenticatedAt'].map(key =>
    typeof evidence[key] === 'string' ? Date.parse(evidence[key] as string) : NaN);
  const [sent, received, authenticated] = timestamps;
  if (!Number.isFinite(now) || timestamps.some(time => !Number.isFinite(time) || time > now)
    || sent > received || received > authenticated || authenticated - sent > 20 * 60_000
    || now - authenticated > 7 * 24 * 60 * 60_000)
    throw new Error('LIVE evidence timestamps are invalid or stale');
  if (!object(provenance) || Object.keys(provenance).length !== 4 || provenance.version !== 1
    || provenance.verification !== 'operator-reviewed-real-inbox' || provenance.evidenceSha256 !== hash(bytes)
    || !Array.isArray(provenance.sourceManifest)) throw new Error('LIVE provenance does not match reviewed evidence');
  const expected = currentManifest.filter(source => liveSourceScope(source.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (!expected.length || expected.some((source, index) => !digest(source.sha256) || (index > 0 && expected[index - 1].path === source.path)))
    throw new Error('Current runtime source manifest is invalid');
  const observed = provenance.sourceManifest;
  if (observed.length !== expected.length || observed.some((source, index) =>
    !object(source) || Object.keys(source).length !== 2 || source.path !== expected[index].path || source.sha256 !== expected[index].sha256))
    throw new Error('LIVE runtime source changed or reviewed manifest is incomplete');
  return { caseId: 'P00-AUTH-LIVE', status: 'PASS' as const, evidenceSha256: hash(bytes), provenanceSha256: hash(provenanceBytes) };
}
