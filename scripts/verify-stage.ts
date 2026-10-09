import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir, mkdtemp, rm, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { acceptanceEnvironment, assertIsolatedEnvironment } from '../tests/support/environment.js';
import { redact, redactJson } from '../tests/support/redaction.js';
import { withAcceptanceLock, AcceptanceWorkspaceBusy } from '../tests/support/acceptance-lock.js';
import { verifyLiveEvidence } from '../tests/acceptance/P00/live-evidence.js';

type Status = 'PASS' | 'FAIL' | 'BLOCKED' | 'PARTIAL';
type Step = { name: string; command: string; startedAt: string; finishedAt: string; exitCode: number | null; status: Status; log: string };
const root = resolve(__dirname, '..');
const arguments_ = process.argv.slice(2).filter(arg => arg !== '--');
const stage = arguments_[0] ?? 'P00';
const evidenceOptions = arguments_.slice(1).filter(arg => arg.startsWith('--live-evidence='));
if (!/^(P\d{2}|ALL)$/.test(stage) || arguments_.slice(1).some(arg => !['--local', '--live'].includes(arg) && !arg.startsWith('--live-evidence='))
  || evidenceOptions.length > 1 || (evidenceOptions.length && (stage !== 'P00' || arguments_.includes('--live') || !evidenceOptions[0].slice(16)))) {
  throw new Error('Usage: pnpm verify:stage -- P00 --local [--live-evidence=<reviewed-directory>] | --live');
}
const liveEvidenceDirectory = evidenceOptions[0]?.slice(16);
let importedLiveEvidence: Awaited<ReturnType<typeof verifyLiveEvidence>> | undefined;
const live = arguments_.includes('--live');
const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
const output = join(root, 'artifacts', 'acceptance', stage, runId);
const steps: Step[] = [];
const gaps: string[] = [];
const env = { ...process.env, ...acceptanceEnvironment };
let rawReports = '';
let localStatus: Status = 'BLOCKED';
let overallStatus: Status = 'BLOCKED';
let startSourceManifest: Array<{ path: string; sha256: string }> = [];

function git(args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : 'unavailable';
}

async function command(name: string, executable: string, args: string[], infrastructure = false, timeoutMs = 180_000) {
  const startedAt = new Date().toISOString();
  if (name === 'live-email') console.log('LIVE: 将发送一封授权测试邮件。收到后依次输入验证码、该邮件实际 Message-ID（两行，均不回显）。');
  let contents = '';
  let outputSuppressed = false;
  let timedOut = false;
  const code = await new Promise<number | null>(resolveExit => {
    const child = spawn(executable, args, { cwd: root, env, shell: process.platform === 'win32', windowsHide: true,
      stdio: [name === 'live-email' ? 'inherit' : 'ignore', 'pipe', 'pipe'] });
    const capture = (data: Buffer) => {
      if (outputSuppressed) return;
      contents += data.toString();
      if (contents.length > 5_000_000) {
        // Never retain a cut secret/token prefix at a buffer boundary.
        contents = '[Command output suppressed: bounded evidence buffer exceeded]';
        outputSuppressed = true;
      }
    };
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true });
      else child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', error => { contents += `\n${error.message}`; clearTimeout(timer); resolveExit(null); });
    child.on('close', exit => { clearTimeout(timer); resolveExit(exit); });
  });
  const log = `${String(steps.length + 1).padStart(2, '0')}-${name}.log`;
  await writeFile(join(output, log), redact(contents + (timedOut ? '\nCommand timed out.' : '')), 'utf8');
  const incompleteLint = name.includes('lint') && /package\s+[^\r\n]*required|(?:missing|required)\s+(?:package|dependenc)|incomplete\s+lint|packages?\s+.*need.*install|do you want to install/i.test(contents);
  const status: Status = code === 0 && !timedOut && !incompleteLint ? 'PASS' : infrastructure ? 'BLOCKED' : 'FAIL';
  if (incompleteLint) gaps.push(`${name} reported missing dependencies/interactive installation; exit zero is not lint evidence`);
  if (outputSuppressed) gaps.push(`${name} log exceeded the evidence buffer; structured test reports remain required`);
  steps.push({ name, command: `${executable} ${args.join(' ')}`, startedAt, finishedAt: new Date().toISOString(), exitCode: code, status, log });
  console.log(`${name}: ${status} (exit ${code ?? 'unavailable'})`);
  return status === 'PASS';
}

async function publishReports(directory: string, target: string) {
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) { await publishReports(join(directory, entry.name), join(target, entry.name)); continue; }
    if (!/\.(json|xml|txt|log)$/.test(entry.name)) {
      // Never publish browser trace/HAR/video/screenshot from authentication steps.
      gaps.push(`Ignored unaudited binary evidence: ${entry.name}`);
      continue;
    }
    const raw = await readFile(join(directory, entry.name), 'utf8');
    const safe = entry.name.endsWith('.json') ? JSON.stringify(redactJson(JSON.parse(raw)), null, 2) : redact(raw);
    await writeFile(join(target, entry.name), safe, 'utf8');
  }
}

function inspectJest(report: Record<string, any>) {
  if (report.numPendingTests || report.numTodoTests || report.numFailedTests || !report.numPassedTests) {
    throw new Error('Jest acceptance must have positive passed count, zero failed/pending/todo tests');
  }
  const titles = (report.testResults ?? []).flatMap((suite: any) => (suite.assertionResults ?? []).map((test: any) => String(test.fullName)));
  for (const id of ['P00-AUTH-02', 'P00-AUTH-03', 'P00-AUTH-04', 'P00-AUTH-05', 'P00-AUTH-06', 'P00-AUTH-07']) {
    if (!titles.some((title: string) => title.includes(id))) throw new Error(`Missing required API case: ${id}`);
  }
  for (const evidence of ['real malicious duplicate-consumption subprocess', 'killing the real API during SMTP DATA', 'actual migrate deploy preserves populated']) {
    if (!titles.some((title: string) => title.includes(evidence))) throw new Error(`Missing required fault/migration/mutation evidence: ${evidence}`);
  }
}

function inspectVitest(report: Record<string, any>) {
  if (!report.numPassedTests || report.numFailedTests || report.numPendingTests || report.numTodoTests || report.success !== true) {
    throw new Error('Frontend unit acceptance requires positive pass count and zero failure/pending/todo');
  }
}

async function sourceManifest() {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean);
  const manifest: Array<{ path: string; sha256: string }> = [];
  for (const relative of [...new Set(files)].sort()) {
    if (/(^|\/)(node_modules|artifacts|dist|coverage|\.git|fonts)(\/|$)/i.test(relative)
      || /(^|\/)\.env/i.test(relative) || /\.(pem|key|pfx|p12|crt|woff2?|ttf|otf|png|jpg|jpeg|gif|zip|gz|pdf)$/i.test(relative)
      || /(^|\/)(credentials|secrets)(\/|$)/i.test(relative)) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|json|vue|sql|md|ya?ml|html|css|scss|ps1|sh|toml)$|(^|\/)Dockerfile$|(^|\/)\.gitignore$/i.test(relative)) continue;
    const absolute = resolve(root, relative);
    if (!absolute.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Git listed a path outside the repository');
    try {
      const stat = await lstat(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) continue;
      manifest.push({ path: relative, sha256: createHash('sha256').update(await readFile(absolute)).digest('hex') });
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return manifest;
}

function inspectPlaywright(report: Record<string, any>) {
  if (!report.stats || !report.stats.expected || report.stats.unexpected || report.stats.skipped || report.stats.flaky) {
    throw new Error('Playwright acceptance requires positive expected count and zero failure/skip/flaky');
  }
  const titles: string[] = [];
  const walk = (suites: any[], prefix = '') => {
    for (const suite of suites ?? []) {
      const name = `${prefix} ${suite.title ?? ''}`;
      for (const spec of suite.specs ?? []) titles.push(`${name} ${spec.title ?? ''}`);
      walk(suite.suites, name);
    }
  };
  walk(report.suites);
  if (!titles.some(title => title.includes('P00-AUTH-01'))) throw new Error('Required real browser SMTP/login case P00-AUTH-01 is missing');
}

async function scanPublishedReports(directory: string) {
  const knownSecrets = [env.JWT_SECRET, env.AUTH_JWT_SECRET, env.AUTH_EMAIL_CODE_PEPPER].filter(Boolean);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await scanPublishedReports(path); continue; }
    const text = await readFile(path, 'utf8');
    if (knownSecrets.some(secret => text.includes(secret)) || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text)) {
      await writeFile(path, '[Evidence suppressed: sensitive material detected]', 'utf8');
      throw new Error(`Sensitive material was found in published evidence: ${entry.name}`);
    }
  }
}

async function run() {
  await mkdir(output, { recursive: true });
  if (stage !== 'P00') { gaps.push(`Stage ${stage} has not been implemented; it cannot pass.`); return; }
  assertIsolatedEnvironment(env);
  startSourceManifest = await sourceManifest();
  rawReports = await mkdtemp(join(tmpdir(), 'nexus-p00-report-'));
  env.JEST_JUNIT_OUTPUT_DIR = rawReports;
  env.JEST_JUNIT_OUTPUT_NAME = 'jest.xml';
  env.PLAYWRIGHT_JSON_OUTPUT_NAME = join(rawReports, 'playwright.json');
  env.PLAYWRIGHT_JUNIT_OUTPUT_NAME = join(rawReports, 'playwright.xml');
  env.P00_ARTIFACT_DIR = rawReports;
  if (!await command('test-infrastructure-contract', process.execPath, ['node_modules/tsx/dist/cli.mjs', '--test', 'tests/support/infrastructure.spec.ts'])) {
    localStatus = overallStatus = 'FAIL';
  }
  if (!await command('live-evidence-regression', process.execPath, ['--test', 'tests/acceptance/P00/live-evidence.test.cjs', 'tests/acceptance/P00/live-email-regression.test.cjs'])) {
    localStatus = overallStatus = 'FAIL';
  }
  const frontend = await command('front-auth-unit', 'pnpm', ['--dir', 'front', 'test:auth', '--reporter=json', `--outputFile=${join(rawReports, 'vitest.json')}`]);
  const backendBuild = await command('backend-build', 'pnpm', ['--dir', 'backend-node', 'build']);
  const frontBuild = await command('front-build', 'pnpm', ['--dir', 'front', 'build'], false, 360_000);
  const lintBackend = await command('backend-lint', 'pnpm', ['--dir', 'backend-node', 'lint:check']);
  const lintFront = await command('front-lint', 'pnpm', ['--dir', 'front', 'lint']);
  if (![frontend, backendBuild, frontBuild, lintBackend, lintFront].every(Boolean)) localStatus = overallStatus = 'FAIL';
  if (frontend) {
    try { inspectVitest(JSON.parse(await readFile(join(rawReports, 'vitest.json'), 'utf8'))); }
    catch (error) { localStatus = overallStatus = 'FAIL'; gaps.push(redact(String(error))); }
  }
  if (!await command('docker-ready', 'docker', ['info'], true, 30_000)) { gaps.push('Docker daemon unavailable'); return; }
  if (!await command('test-services', 'docker', ['compose', '-f', 'docker-compose.test.yml', 'up', '-d', '--wait'], true, 600_000)) {
    gaps.push('Isolated PostgreSQL/Redis/Mailpit could not start'); return;
  }
  let mailReady = false;
  const mailDeadline = Date.now() + 15_000;
  while (Date.now() < mailDeadline && !mailReady) {
    try {
      const mail = await fetch(`${env.P00_MAILPIT_URL}/api/v1/messages`, { signal: AbortSignal.timeout(2000) });
      mailReady = mail.ok;
    } catch { /* Container running is not yet API-ready; bounded readiness poll. */ }
    if (!mailReady) await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  if (!mailReady) { gaps.push('Mailpit API did not become ready before the bounded deadline'); return; }
  const prepare = await command('prisma-generate', 'pnpm', ['--dir', 'backend-node', 'exec', 'prisma', 'generate'])
    && await command('migrate', 'pnpm', ['--dir', 'backend-node', 'exec', 'prisma', 'migrate', 'deploy']);
  if (!prepare) { localStatus = overallStatus = 'FAIL'; return; }
  const api = await command('auth-api', 'pnpm', ['--dir', 'backend-node', 'test:auth', '--json', `--outputFile=${join(rawReports, 'jest.json')}`], false, 360_000);
  const browser = await command('auth-browser', 'pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.config.ts', '--reporter=json,junit'], false, 360_000);
  if (![api, browser, backendBuild, frontBuild, lintBackend, lintFront, frontend].every(Boolean) || localStatus === 'FAIL') { localStatus = overallStatus = 'FAIL'; return; }
  inspectJest(JSON.parse(await readFile(join(rawReports, 'jest.json'), 'utf8')));
  inspectPlaywright(JSON.parse(await readFile(join(rawReports, 'playwright.json'), 'utf8')));
  localStatus = 'PASS';
  if (liveEvidenceDirectory) {
    importedLiveEvidence = await verifyLiveEvidence(resolve(root, liveEvidenceDirectory), startSourceManifest);
    await writeFile(join(output, 'reviewed-live-evidence.json'), JSON.stringify(importedLiveEvidence, null, 2), 'utf8');
    overallStatus = 'PASS';
    return;
  }
  if (!live) { gaps.push('P00-AUTH-LIVE real SMTP/inbox/login has not been authorized or verified'); return; }
  if (env.LIVE_INTEGRATION !== '1' || !env.LIVE_TEST_EMAIL || env.LIVE_TEST_EMAIL !== env.LIVE_EMAIL_ALLOWED_RECIPIENT
    || !env.LIVE_API_URL || !env.LIVE_ORIGIN || !process.stdin.isTTY) {
    gaps.push('Live authorization/recipient/API/origin/interactive inbox prerequisite missing; no mail was sent');
    return;
  }
  const livePassed = await command('live-email', process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tests/acceptance/P00/live-email-smoke.ts'], false, 600_000);
  const liveStep = steps.at(-1)!;
  if (liveStep.exitCode === 2) { liveStep.status = 'BLOCKED'; overallStatus = 'BLOCKED'; gaps.push('Live inbox prerequisite missing'); }
  else overallStatus = livePassed ? 'PASS' : 'FAIL';
}

async function main() {
  if (stage === 'P01') {
    if (live) throw new Error('P01 has no live email mode; use --local');
    await import('../tests/acceptance/P01/verify-local.js');
    return;
  }
  if (stage === 'P02') {
    if (live) throw new Error('P02 has no --live email mode; use --local');
    await import('./verify-p02.js');
    return;
  }
try { await run(); }
catch (error) {
  // Missing infrastructure is distinguished from a failed executed acceptance.
  overallStatus = localStatus = steps.some(step => step.status === 'FAIL') || steps.some(step => step.name === 'auth-api') ? 'FAIL' : 'BLOCKED';
  gaps.push(redact(error instanceof Error ? error.message : String(error)));
}
finally {
  if (rawReports) {
    try { await publishReports(rawReports, join(output, 'reports')); }
    catch (error) { overallStatus = 'FAIL'; gaps.push(`Report publication failed: ${redact(String(error))}`); }
    // Remove only the exact temp directory returned by mkdtemp, never a user path.
    await rm(rawReports, { recursive: true, force: true });
  }
  if (steps.some(step => step.status === 'FAIL')) overallStatus = localStatus = 'FAIL';
  const hashedSources = await sourceManifest();
  const sourceStartSha256 = createHash('sha256').update(JSON.stringify(startSourceManifest)).digest('hex');
  const sourceEndSha256 = createHash('sha256').update(JSON.stringify(hashedSources)).digest('hex');
  if (startSourceManifest.length && sourceStartSha256 !== sourceEndSha256) {
    gaps.push('Source/config contents changed during acceptance; rerun on a frozen tree is required');
    localStatus = overallStatus = 'FAIL';
  }
  const report = {
    stage, runId, contractVersion: 1, localStatus, overallStatus,
    revision: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
    dirtyDiffSha256: createHash('sha256').update(JSON.stringify({ status: git(['status', '--porcelain']), hashedSources })).digest('hex'),
    sourceManifest: hashedSources,
    sourceStartSha256, sourceEndSha256,
    hashScope: 'Tracked and untracked text source/config contents; env, credentials, dependencies, artifacts, fonts and binaries excluded',
    nodeVersion: process.version, platform: process.platform,
    completedAt: new Date().toISOString(), steps, gaps,
    importedLiveEvidence,
    note: 'Mailpit SMTP accepted is NOT real inbox delivery. Imported LIVE evidence is operator-reviewed real receipt bound to unchanged runtime sources; it is not an automated inbox-reader claim.',
  };
  try { await scanPublishedReports(output); }
  catch (error) { overallStatus = 'FAIL'; report.overallStatus = 'FAIL'; gaps.push(redact(String(error))); }
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'report.json'), JSON.stringify(redactJson(report), null, 2), 'utf8');
  const escapeXml = (text: string) => text.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
  const testcases = steps.map(step => `<testcase name="${escapeXml(step.name)}">${step.status === 'PASS' ? '' : `<failure message="${step.status}">${escapeXml(step.log)}</failure>`}</testcase>`).join('');
  const gate = overallStatus === 'PASS' ? `<testcase name="${stage}-complete-gate"/>` : `<testcase name="${stage}-complete-gate"><failure message="${overallStatus}">${escapeXml(gaps.join('; '))}</failure></testcase>`;
  await writeFile(join(output, 'gate.xml'), `<testsuite name="${stage}" tests="${steps.length + 1}" failures="${steps.filter(step => step.status !== 'PASS').length + (overallStatus === 'PASS' ? 0 : 1)}">${testcases}${gate}</testsuite>`, 'utf8');
  console.log(`localStatus=${localStatus}; overallStatus=${overallStatus}; report=${join(output, 'report.json')}`);
  process.exitCode = overallStatus === 'PASS' ? 0 : overallStatus === 'FAIL' ? 1 : 2;
}
}
// Imported P01/P02 runners own their own lock; do not acquire it twice.
void (stage === 'P01' || stage === 'P02' ? main() : withAcceptanceLock(root, main)).catch(error => { console.error(redact(String(error))); process.exitCode = error instanceof AcceptanceWorkspaceBusy ? 2 : 1; });
