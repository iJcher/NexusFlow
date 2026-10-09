const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const ts = require('../../../backend-node/node_modules/typescript');

// Actual implementation, real temporary filesystem; no SMTP, env, database or
// pre-existing acceptance artifacts are accessed by this independent suite.
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(syncFs.readFileSync(path.join(__dirname, 'live-evidence.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, require, Buffer });
const { liveSourceScope, verifyLiveEvidence } = exportsObject;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const NOW = Date.parse('2026-10-09T09:00:00.000Z');
const manifest = [
  { path: 'backend-node/src/auth/auth.service.ts', sha256: hash('auth') },
  { path: 'backend-node/prisma/schema.prisma', sha256: hash('schema') },
  { path: 'front/src/login.vue', sha256: hash('ui') },
  { path: 'package.json', sha256: hash('dependencies') },
  { path: 'tests/acceptance/P00/live-email-smoke.ts', sha256: hash('smoke') },
  { path: 'docs/progress.md', sha256: hash('docs') },
];
const evidence = () => ({
  caseId: 'P00-AUTH-LIVE', status: 'PASS', mode: 'manual-real-inbox-plus-automated-login',
  recipientHash: hash('fixture-recipient'), sentAt: '2026-10-09T08:40:00.000Z',
  receivedAt: '2026-10-09T08:41:00.000Z', authenticatedAt: '2026-10-09T08:42:00.000Z',
  loggedOut: true, messageIdSha256: hash('fixture-message'),
  note: 'Inbox receipt has a manual step; code/token/cookie are not retained. This is not an automated inbox-reader claim.',
});
const scoped = (input = manifest) => input.filter(x => liveSourceScope(x.path)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nf-live-evidence-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const value = evidence();
  options.evidence?.(value);
  const bytes = options.rawEvidence ?? JSON.stringify(value);
  const provenance = { version: 1, verification: 'operator-reviewed-real-inbox', evidenceSha256: hash(bytes), sourceManifest: scoped() };
  options.provenance?.(provenance);
  await fs.writeFile(path.join(directory, 'live-email.json'), bytes);
  await fs.writeFile(path.join(directory, 'provenance.json'), options.rawProvenance ?? JSON.stringify(provenance));
  return { directory, bytes, provenance };
}
const rejects = (name, options, current = manifest, now = NOW) => test(name, async t => {
  const f = await fixture(t, options);
  await assert.rejects(verifyLiveEvidence(f.directory, current, now));
});

for (const filename of ['backend-node/src/main.ts', 'backend-node/src/deep/a.ts', 'backend-node/prisma/migrations/a/migration.sql',
  'front/src/main.ts', 'front/src/components/A.vue', 'package.json', 'pnpm-lock.yaml', 'backend-node/package.json',
  'backend-node/pnpm-lock.yaml', 'front/package.json', 'front/pnpm-lock.yaml', 'tests/acceptance/P00/live-email-smoke.ts']) {
  test(`runtime scope includes ${filename}`, () => assert.equal(liveSourceScope(filename), true));
}
for (const filename of ['docs/progress.md', 'tests/acceptance/P00/live-evidence.ts', 'tests/acceptance/P00/live-evidence.test.cjs',
  'tests/acceptance/P00/live-email-regression.test.cjs', 'backend-node/test/auth.spec.ts', 'front/tests/login.spec.ts',
  '.env.live', 'artifacts/acceptance/report.json', 'scripts/verify-stage.ts', 'x/backend-node/src/main.ts',
  'backend-node/src-other.ts', 'front/src-other.ts']) {
  test(`runtime scope excludes ${filename}`, () => assert.equal(liveSourceScope(filename), false));
}
test('valid historical evidence returns exact byte digests without secrets or writes', async t => {
  const f = await fixture(t);
  const before = await fs.readFile(path.join(f.directory, 'provenance.json'));
  const result = await verifyLiveEvidence(f.directory, manifest, NOW);
  assert.equal(result.caseId, 'P00-AUTH-LIVE');
  assert.equal(result.status, 'PASS');
  assert.equal(result.evidenceSha256, hash(f.bytes));
  assert.equal(result.provenanceSha256, hash(before));
  assert.deepEqual(Object.keys(result).sort(), ['caseId', 'evidenceSha256', 'provenanceSha256', 'status']);
  assert.deepEqual(await fs.readFile(path.join(f.directory, 'provenance.json')), before);
  assert.equal(await fs.readFile(path.join(f.directory, 'live-email.json'), 'utf8'), f.bytes);
});
test('gate, tests and documents changes do not invalidate runtime evidence', async t => {
  const f = await fixture(t);
  const current = manifest.map(x => x.path.startsWith('docs/') ? { ...x, sha256: hash('new docs') } : x);
  current.push({ path: 'tests/acceptance/P00/live-evidence.ts', sha256: hash('new gate') },
    { path: 'backend-node/test/new.spec.ts', sha256: hash('new test') });
  assert.equal((await verifyLiveEvidence(f.directory, current.reverse(), NOW)).status, 'PASS');
});
for (const [name, mutation] of [
  ['wrong case', e => e.caseId = 'P00-FAKE'], ['non-PASS', e => e.status = 'PENDING'],
  ['automated inbox claim', e => e.mode = 'automated-inbox'], ['logout false', e => e.loggedOut = false],
  ['logout truthy string', e => e.loggedOut = 'true'], ['incorrect note', e => e.note = 'All good'],
  ['missing field', e => delete e.receivedAt], ['OTP added', e => e.code = '123456'],
  ['token added', e => e.accessToken = 'secret-fixture'], ['cookie added', e => e.cookie = 'secret-fixture'],
  ['plaintext recipient added', e => e.email = 'fixture@example.test'], ['unknown field', e => e.extra = true],
]) rejects(`rejects evidence ${name}`, { evidence: mutation });
for (const key of ['recipientHash', 'messageIdSha256']) {
  for (const bad of ['', 'a'.repeat(63), 'g'.repeat(64), 'A'.repeat(64), 42, null]) {
    rejects(`rejects ${key} invalid digest ${String(bad).slice(0, 8)}`, { evidence: e => e[key] = bad });
  }
}
for (const key of ['sentAt', 'receivedAt', 'authenticatedAt']) {
  for (const value of [null, 123, 'not-a-date', '2026-10-09T09:00:00.001Z']) {
    rejects(`rejects ${key} timestamp ${value}`, { evidence: e => e[key] = value });
  }
}
rejects('rejects receipt before send', { evidence: e => e.receivedAt = '2026-10-09T08:39:59Z' });
rejects('rejects authentication before receipt', { evidence: e => e.authenticatedAt = '2026-10-09T08:40:30Z' });
rejects('rejects auth taking over 20 minutes', { evidence: e => {
  e.sentAt = '2026-10-09T08:00:00Z'; e.receivedAt = '2026-10-09T08:01:00Z'; e.authenticatedAt = '2026-10-09T08:20:00.001Z';
} });
rejects('rejects evidence older than seven days', {}, manifest, Date.parse('2026-10-16T08:42:00.001Z'));
rejects('rejects invalid current clock', {}, manifest, NaN);
test('exact seven days remains valid', async t => {
  const f = await fixture(t);
  assert.equal((await verifyLiveEvidence(f.directory, manifest, Date.parse('2026-10-16T08:42:00Z'))).status, 'PASS');
});
for (const raw of ['{', 'null', '[]', 'true']) rejects(`rejects malformed/nonobject evidence ${raw}`, { rawEvidence: raw });
for (const raw of ['{', 'null', '[]', 'true']) rejects(`rejects malformed/nonobject provenance ${raw}`, { rawProvenance: raw });
rejects('rejects oversized evidence even if JSON starts correctly', { rawEvidence: ' '.repeat(65537) });
rejects('rejects oversized provenance', { rawProvenance: ' '.repeat(65537) });
for (const [name, mutation] of [
  ['wrong version', p => p.version = 2], ['wrong verification', p => p.verification = 'assumed'],
  ['wrong hash', p => p.evidenceSha256 = hash('different bytes')], ['missing field', p => delete p.version],
  ['extra secret field', p => p.token = 'fixture'], ['manifest not array', p => p.sourceManifest = {}],
  ['manifest missing runtime file', p => p.sourceManifest.pop()], ['manifest empty', p => p.sourceManifest = []],
  ['manifest additional file', p => p.sourceManifest.push({ path: 'docs/extra.md', sha256: hash('extra') })],
  ['manifest duplicate file', p => p.sourceManifest[1] = p.sourceManifest[0]],
  ['manifest unsorted', p => p.sourceManifest.reverse()],
  ['manifest entry extra field', p => p.sourceManifest[0].secret = 'fixture'],
  ['manifest entry missing hash', p => delete p.sourceManifest[0].sha256],
  ['manifest entry nonobject', p => p.sourceManifest[0] = null],
]) rejects(`rejects provenance ${name}`, { provenance: mutation });
for (const source of scoped()) {
  rejects(`rejects changed runtime ${source.path}`, {}, manifest.map(x => x.path === source.path ? { ...x, sha256: hash('changed') } : x));
}
rejects('rejects duplicate current runtime manifest', {}, [...manifest, manifest[0]]);
rejects('rejects invalid current runtime digest', {}, manifest.map((x, i) => i === 0 ? { ...x, sha256: 'bad' } : x));
rejects('rejects empty current runtime manifest', {}, [{ path: 'docs/a.md', sha256: hash('docs') }]);
test('changing only evidence serialization still requires new exact byte provenance', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.directory, 'live-email.json'), JSON.stringify(evidence(), null, 2));
  await assert.rejects(verifyLiveEvidence(f.directory, manifest, NOW));
});
for (const name of ['live-email.json', 'provenance.json']) {
  test(`rejects missing ${name}`, async t => {
    const f = await fixture(t); await fs.unlink(path.join(f.directory, name));
    await assert.rejects(verifyLiveEvidence(f.directory, manifest, NOW));
  });
  test(`rejects directory instead of ${name}`, async t => {
    const f = await fixture(t); await fs.unlink(path.join(f.directory, name)); await fs.mkdir(path.join(f.directory, name));
    await assert.rejects(verifyLiveEvidence(f.directory, manifest, NOW));
  });
  test(`rejects symlink ${name}`, async t => {
    const f = await fixture(t); const file = path.join(f.directory, name);
    // Windows unprivileged processes cannot create file symlinks; junctions
    // provide a real lstat-visible symbolic link at the same evidence path.
    const target = path.join(f.directory, `${name}.target`);
    if (process.platform === 'win32') {
      await fs.unlink(file); await fs.mkdir(target); await fs.symlink(target, file, 'junction');
    } else { await fs.rename(file, target); await fs.symlink(target, file, 'file'); }
    assert.equal((await fs.lstat(file)).isSymbolicLink(), true);
    await assert.rejects(verifyLiveEvidence(f.directory, manifest, NOW));
  });
}
test('rejects symbolic-link evidence directory (Windows junction)', async t => {
  const f = await fixture(t); const link = `${f.directory}-link`;
  t.after(() => fs.rm(link, { force: true, recursive: true }));
  await fs.symlink(f.directory, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyLiveEvidence(link, manifest, NOW));
});

// Run actual argument parsing and gate/control flow. Only process commands,
// temporary report IO and source enumeration are isolated; real inbox verifier
// results are injected, because module validation is covered above using real IO.
const runnerSource = syncFs.readFileSync(path.resolve(__dirname, '../../../scripts/verify-stage.ts'), 'utf8');
const runnerCompiled = ts.transpileModule(runnerSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  transformers: { before: [context => {
    const visit = node => {
      if (ts.isFunctionDeclaration(node) && ['command', 'sourceManifest'].includes(node.name?.text)) {
        const statement = node.name.text === 'command'
          ? 'return __command(name, executable, args, steps);'
          : 'return __manifest;';
        const parsed = ts.createSourceFile('replacement.ts', statement, ts.ScriptTarget.Latest, true);
        return context.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name,
          node.typeParameters, node.parameters, node.type, context.factory.createBlock([...parsed.statements], true));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return root => ts.visitNode(root, visit);
  }] },
}).outputText;
async function runnerHarness(args, options = {}) {
  const files = new Map(); const commands = []; const imported = []; let completion;
  const fakeProcess = { argv: ['node', 'verify-stage.ts', ...args], env: {}, platform: process.platform,
    execPath: process.execPath, stdin: { isTTY: false }, pid: 42, version: process.version, exitCode: undefined };
  const apiTitles = ['P00-AUTH-02', 'P00-AUTH-03', 'P00-AUTH-04', 'P00-AUTH-05', 'P00-AUTH-06', 'P00-AUTH-07',
    'real malicious duplicate-consumption subprocess', 'killing the real API during SMTP DATA', 'actual migrate deploy preserves populated'];
  const fakeFs = { mkdir: async () => {}, mkdtemp: async () => 'mock-reports', rm: async () => {}, readdir: async () => [],
    writeFile: async (file, bytes) => files.set(file, bytes),
    readFile: async file => {
      if (file.endsWith('vitest.json')) return JSON.stringify({ numPassedTests: 1, success: true });
      if (file.endsWith('jest.json')) return JSON.stringify({ numPassedTests: 7,
        testResults: [{ assertionResults: apiTitles.map(fullName => ({ fullName })) }] });
      if (file.endsWith('playwright.json')) return JSON.stringify({ stats: { expected: 1 },
        suites: [{ specs: [{ title: 'P00-AUTH-01' }] }] });
      if (files.has(file)) return files.get(file);
      throw new Error('Unrecognized isolated read');
    } };
  const req = name => {
    if (name === 'node:fs/promises') return fakeFs;
    if (name === 'node:child_process') return { spawn: () => { throw new Error('Real subprocess forbidden'); },
      spawnSync: () => ({ status: 0, stdout: 'fixture-revision' }) };
    if (name.endsWith('environment.js')) return { acceptanceEnvironment: { P00_MAILPIT_URL: 'http://fixture.invalid' }, assertIsolatedEnvironment: () => {} };
    if (name.endsWith('redaction.js')) return { redact: x => x, redactJson: x => x };
    if (name.endsWith('acceptance-lock.js')) return { AcceptanceWorkspaceBusy: class extends Error {},
      withAcceptanceLock: (_root, fn) => { completion = Promise.resolve().then(fn); return completion; } };
    if (name.endsWith('live-evidence.js')) return { verifyLiveEvidence: async (directory, current) => {
      imported.push({ directory, current });
      if (options.badEvidence) throw new Error('Fixture invalid provenance');
      return { caseId: 'P00-AUTH-LIVE', status: 'PASS', evidenceSha256: hash('evidence'), provenanceSha256: hash('provenance') };
    } };
    return require(name);
  };
  vm.runInNewContext(runnerCompiled, { exports: {}, require: req, __dirname: path.resolve(__dirname, '../../../scripts'),
    process: fakeProcess, console: { log: () => {}, error: () => {} }, Buffer,
    setTimeout, clearTimeout, AbortSignal, fetch: async () => ({ ok: true }), __manifest: manifest,
    __command: async (name, executable, argv, steps) => {
      commands.push({ name, executable, argv });
      const passed = options.failStep !== name;
      steps.push({ name, status: passed ? 'PASS' : 'FAIL', log: `${name}.log`, exitCode: passed ? 0 : 1 });
      return passed;
    } });
  if (completion) await completion;
  const reportFile = [...files.keys()].find(file => file.endsWith('report.json'));
  return { files, commands, imported, process: fakeProcess, report: reportFile ? JSON.parse(files.get(reportFile)) : undefined };
}
for (const [name, args] of [
  ['P01 evidence', ['P01', '--local', '--live-evidence=fixture']],
  ['P02 evidence', ['P02', '--local', '--live-evidence=fixture']],
  ['duplicate evidence', ['P00', '--live-evidence=a', '--live-evidence=b']],
  ['empty evidence', ['P00', '--live-evidence=']],
  ['evidence and live-send combined', ['P00', '--live-evidence=fixture', '--live']],
  ['unrecognized option', ['P00', '--live-evidence=fixture', '--unknown']],
]) test(`runner rejects ${name} before IO/subprocesses`, () => assert.rejects(runnerHarness(args), /Usage/));
test('runner imports accepted evidence only after local success and never sends mail', async () => {
  const result = await runnerHarness(['P00', '--local', '--live-evidence=fixture']);
  assert.equal(result.report.localStatus, 'PASS'); assert.equal(result.report.overallStatus, 'PASS');
  assert.equal(result.process.exitCode, 0); assert.equal(result.imported.length, 1);
  assert.equal(result.commands.some(x => x.name === 'live-email' || x.argv.some(arg => arg.endsWith('live-email-smoke.ts'))), false);
});
for (const failStep of ['test-infrastructure-contract', 'live-evidence-regression', 'front-auth-unit', 'backend-build',
  'front-build', 'backend-lint', 'front-lint', 'prisma-generate', 'migrate', 'auth-api', 'auth-browser']) {
  test(`runner cannot override local failure ${failStep} with evidence PASS`, async () => {
    const result = await runnerHarness(['P00', '--local', '--live-evidence=fixture'], { failStep });
    assert.equal(result.report.overallStatus, 'FAIL'); assert.equal(result.process.exitCode, 1);
    assert.equal(result.imported.length, 0); assert.equal(result.commands.some(x => x.name === 'live-email'), false);
  });
}
test('runner rejects invalid imported evidence without fallback email sending', async () => {
  const result = await runnerHarness(['P00', '--local', '--live-evidence=fixture'], { badEvidence: true });
  assert.notEqual(result.report.overallStatus, 'PASS'); assert.equal(result.process.exitCode, 1);
  assert.equal(result.imported.length, 1); assert.equal(result.commands.some(x => x.name === 'live-email'), false);
});
