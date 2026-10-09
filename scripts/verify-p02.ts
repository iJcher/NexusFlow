import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, mkdtemp, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { p02Environment, assertP02Environment } from '../tests/support/p02-environment.js';
import { redact, redactJson } from '../tests/support/redaction.js';
import { withAcceptanceLock, AcceptanceWorkspaceBusy } from '../tests/support/acceptance-lock.js';

type Status = 'PASS' | 'FAIL' | 'BLOCKED';
type Step = { name: string; command: string; status: Status; exitCode: number | null; startedAt: string; finishedAt: string; log: string };
type Source = { path: string; sha256: string };
const root = resolve(__dirname, '..');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
const directory = join(root, 'artifacts', 'acceptance', 'P02', runId);
const namespace = `nf-p02-${randomBytes(8).toString('hex')}`;
const env: NodeJS.ProcessEnv = { ...process.env, ...p02Environment, WORKFLOW_QUEUE_NAME: namespace, WORKFLOW_QUEUE_PREFIX: namespace };
const steps: Step[] = [];
const gaps: string[] = ['P00/P01 dependency acceptance has not passed'];
let jsIsolationStatus: Status = 'BLOCKED';
let unitStatus: Status = 'BLOCKED';
let integrationStatus: Status = 'BLOCKED';
let overallStatus: Status = 'BLOCKED';
let temporary = '';
let startSources: Source[] = [];

function git(args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Git evidence unavailable');
  return result.stdout.trim();
}

async function sources(): Promise<Source[]> {
  const paths = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const result: Source[] = [];
  for (const path of [...new Set(paths)].sort()) {
    if (/(^|\/)(node_modules|artifacts|dist|coverage|\.git|fonts|secrets|credentials)(\/|$)/i.test(path)
      || /(^|\/)\.env/i.test(path) || !/\.(ts|tsx|js|cjs|mjs|json|vue|sql|md|ya?ml|html|css|scss|ps1|sh|toml)$|(^|\/)Dockerfile$|(^|\/)\.gitignore$/i.test(path)) continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Source manifest path escaped repository');
    try {
      const stat = await lstat(absolute);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2_000_000) result.push({ path, sha256: createHash('sha256').update(await readFile(absolute)).digest('hex') });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return result;
}

async function command(name: string, executable: string, args: string[], infrastructure = false, timeout = 180_000) {
  const startedAt = new Date().toISOString();
  let text = '';
  let suppressed = false;
  let timedOut = false;
  const exitCode = await new Promise<number | null>(resolveCode => {
    const child = spawn(executable, args, { cwd: root, env, shell: process.platform === 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const collect = (chunk: Buffer) => {
      if (suppressed) return;
      text += chunk.toString();
      if (text.length > 5_000_000) { text = '[Output suppressed: bounded buffer exceeded]'; suppressed = true; }
    };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill('SIGTERM');
    }, timeout);
    child.on('error', error => { text += `\n${error.message}`; clearTimeout(timer); resolveCode(null); });
    child.on('close', code => { clearTimeout(timer); resolveCode(code); });
  });
  const lintIncomplete = name.includes('lint') && /packages?[^\r\n]*required|incomplete lint|do you want to install|missing dependenc/i.test(text);
  const status: Status = exitCode === 0 && !timedOut && !lintIncomplete ? 'PASS' : infrastructure ? 'BLOCKED' : 'FAIL';
  const log = `${String(steps.length + 1).padStart(2, '0')}-${name}.log`;
  await writeFile(join(directory, log), redact(text + (timedOut ? '\nBounded command timeout' : '')), 'utf8');
  steps.push({ name, command: `${executable} ${args.join(' ')}`, status, exitCode, startedAt, finishedAt: new Date().toISOString(), log });
  console.log(`${name}: ${status}`);
  return status === 'PASS';
}

async function inspectReport(name: string, requiredTags: string[]) {
  const report = JSON.parse(await readFile(join(temporary, name), 'utf8'));
  if (!report.numPassedTests || report.numFailedTests || report.numPendingTests || report.numTodoTests || report.success !== true) throw new Error(`${name}: positive pass count and zero failure/skip/todo required`);
  const titles: string[] = (report.testResults ?? []).flatMap((suite: { assertionResults?: Array<{ fullName: string }> }) => (suite.assertionResults ?? []).map(test => test.fullName));
  for (const tag of requiredTags) if (!titles.some(title => title.includes(tag))) throw new Error(`${name}: required case ${tag} missing`);
  return { passed: report.numPassedTests, failed: report.numFailedTests, pending: report.numPendingTests, requiredTags };
}

async function publishReports(from: string, to: string) {
  await mkdir(to, { recursive: true });
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.isDirectory()) { await publishReports(join(from, entry.name), join(to, entry.name)); continue; }
    if (!/\.(json|xml|log|txt)$/.test(entry.name)) { gaps.push(`Unaudited binary evidence suppressed: ${entry.name}`); continue; }
    const text = await readFile(join(from, entry.name), 'utf8');
    await writeFile(join(to, entry.name), entry.name.endsWith('.json') ? JSON.stringify(redactJson(JSON.parse(text)), null, 2) : redact(text), 'utf8');
  }
}

async function scanReports(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) { await scanReports(file); continue; }
    const text = await readFile(file, 'utf8');
    if ([env.AUTH_JWT_SECRET, env.JWT_SECRET, env.AUTH_EMAIL_CODE_PEPPER].filter(Boolean).some(secret => text.includes(secret!))
      || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text)) {
      await writeFile(file, '[Evidence suppressed: sensitive content detected]', 'utf8');
      throw new Error(`Sensitive evidence detected in ${entry.name}`);
    }
  }
}

const counts: Record<string, unknown> = {};
async function run() {
  await mkdir(directory, { recursive: true });
  assertP02Environment(env);
  startSources = await sources();
  temporary = await mkdtemp(join(tmpdir(), 'nexus-p02-evidence-'));
  env.P02_ARTIFACT_DIR = temporary; env.JEST_JUNIT_OUTPUT_DIR = temporary;
  env.JEST_JUNIT_OUTPUT_NAME = 'unit.xml';
  if (await command('runs-unit', 'pnpm', ['--dir', 'backend-node', 'test:runs:unit', '--json', `--outputFile=${join(temporary, 'unit.json')}`])) {
    try { counts.unit = await inspectReport('unit.json', ['P02-01', 'P02-02', 'P02 compiler publication validation']); unitStatus = 'PASS'; }
    catch (error) { unitStatus = 'FAIL'; gaps.push(redact(String(error))); }
  } else unitStatus = 'FAIL';
  env.P02_NEGATIVE_ARTIFACT_DIR = join(temporary, 'negative-control');
  await command('runs-negative-control', process.execPath, [
    'node_modules/tsx/dist/cli.mjs', 'tests/acceptance/P02/negative-control.ts',
  ]);
  await command('prisma-generate', 'pnpm', ['--dir', 'backend-node', 'exec', 'prisma', 'generate']);
  await command('runs-build', 'pnpm', ['--dir', 'backend-node', 'build']);
  await command('runs-lint', 'pnpm', ['--dir', 'backend-node', 'exec', 'eslint', 'src/runs/**/*.ts', 'src/run-worker.ts', 'test/runs/**/*.ts']);
  if (!await command('docker-ready', 'docker', ['info'], true, 30_000)) { gaps.push('Docker daemon unavailable; no real PG/Redis integration executed'); return; }
  if (!await command('p02-services', 'docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', '--wait', 'postgres', 'queue-redis'], true, 180_000)) {
    gaps.push('Isolated PostgreSQL/queue Redis could not start'); return;
  }
  if (!await command('p02-migrate', 'pnpm', ['--dir', 'backend-node', 'exec', 'prisma', 'migrate', 'deploy'])) return;
  env.JEST_JUNIT_OUTPUT_NAME = 'integration.xml';
  if (await command('runs-integration', 'pnpm', ['--dir', 'backend-node', 'test:runs:e2e', '--json', `--outputFile=${join(temporary, 'integration.json')}`], false, 360_000)) {
    try {
      counts.integration = await inspectReport('integration.json', ['P02-03', 'P02-04', 'P02-05', 'P02-06', 'P02-07', 'P02-08', 'P02-09', 'P02-10']);
      integrationStatus = 'PASS';
      jsIsolationStatus = 'PASS';
    } catch (error) { integrationStatus = 'FAIL'; gaps.push(redact(String(error))); }
  } else integrationStatus = 'FAIL';
}

async function main() {
  try { await run(); }
  catch (error) { gaps.push(redact(String(error))); overallStatus = steps.some(step => step.status === 'FAIL') ? 'FAIL' : 'BLOCKED'; }
  finally {
    if (temporary) {
      try { await publishReports(temporary, join(directory, 'reports')); }
      catch (error) { overallStatus = 'FAIL'; gaps.push(`Evidence publication failed: ${redact(String(error))}`); }
      // This is exactly the random directory created by mkdtemp, never a user-supplied path.
      await rm(temporary, { recursive: true, force: true });
    }
    const endSources = await sources();
    const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const startSha256 = hash(startSources), endSha256 = hash(endSources);
    if (startSources.length && startSha256 !== endSha256) { overallStatus = 'FAIL'; gaps.push('Source/config changed during acceptance; freeze tree and rerun'); }
    if (unitStatus === 'FAIL' || integrationStatus === 'FAIL' || steps.some(step => step.status === 'FAIL')) overallStatus = 'FAIL';
    if (jsIsolationStatus !== 'PASS') gaps.push('P02-08 real container isolation acceptance has not passed');
    try { await scanReports(directory); }
    catch (error) { overallStatus = 'FAIL'; gaps.push(redact(String(error))); }
    const report = {
      stage: 'P02', contractVersion: 1, runId, unitStatus, integrationStatus, overallStatus,
      dependencyStatus: 'BLOCKED', jsIsolationStatus, revision: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
      dirtyDiffSha256: hash({ status: git(['status', '--porcelain']), sources: endSources }), sourceStartSha256: startSha256, sourceEndSha256: endSha256,
      sourceManifest: endSources, hashScope: 'Tracked+untracked text source; env/secrets/binaries/dependencies/artifacts excluded',
      node: process.version, finishedAt: new Date().toISOString(), steps, counts, gaps,
    };
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'report.json'), JSON.stringify(redactJson(report), null, 2), 'utf8');
    const xml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
    const cases = steps.map(step => `<testcase name="${xml(step.name)}">${step.status === 'PASS' ? '' : `<failure message="${step.status}">${xml(step.log)}</failure>`}</testcase>`).join('');
    await writeFile(join(directory, 'gate.xml'), `<testsuite name="P02" tests="${steps.length + 1}" failures="${steps.filter(step => step.status !== 'PASS').length + 1}">${cases}<testcase name="P02-complete-gate"><failure message="${overallStatus}">${xml(gaps.join('; '))}</failure></testcase></testsuite>`, 'utf8');
    console.log(`P02 unit=${unitStatus} integration=${integrationStatus} overall=${overallStatus}; report=${join(directory, 'report.json')}`);
    process.exitCode = overallStatus === 'FAIL' ? 1 : 2;
  }
}
void withAcceptanceLock(root, main).catch(error => { console.error(redact(String(error))); process.exitCode = error instanceof AcceptanceWorkspaceBusy ? 2 : 1; });
