const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = resolve(__dirname, '../../..');
const ts = createRequire(resolve(root, 'backend-node/package.json'))('typescript');
const source = readFileSync(resolve(__dirname, 'verify-local.ts'), 'utf8');
const tree = ts.createSourceFile('verify-local.ts', source, ts.ScriptTarget.Latest, true);

// Execute the actual runner's AST-selected statements, not a copied parser.
// Importing verify-local would start a full stage and corrupt frozen evidence.
function extract(predicate) {
  const statements = tree.statements.filter(predicate);
  assert.equal(statements.length, 1, 'runner structure changed: review extraction');
  return statements[0].getText(tree);
}
const versionSource = extract(node => ts.isFunctionDeclaration(node) && node.name?.text === 'version');
const envSource = extract(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === 'env'));
const envLoop = extract(node => ts.isForOfStatement(node) && node.statement.getText(tree).includes('env[name] = process.env[name]'));

function execute(code, context) {
  const javascript = ts.transpileModule(code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  return vm.runInNewContext(javascript, context);
}
function parse(stdout, status = 0) {
  return execute(versionSource + '\nversion("pnpm", ["--version"]);', {
    root, env: {}, process: { platform: 'win32' },
    spawnSync: () => ({ status, stdout }),
  });
}
function environment(inherited, loop = envLoop) {
  return execute(envSource + '\n' + loop + '\nenv;', {
    acceptanceEnvironment: { NODE_ENV: 'test', FIXTURE_SENTINEL: 'public-fixture' },
    process: { env: inherited },
  });
}
function oldParse(stdout) {
  const match = stdout.trim().match(/^(?:Version\s+|v)?(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?)$/);
  return match ? match[1] : 'UNAVAILABLE';
}

for (const [name, output, expected] of [
  ['plain pnpm', '11.22.0\r\n', '11.22.0'],
  ['node prefix', 'v24.19.0\n', '24.19.0'],
  ['typescript prefix', 'Version 5.9.3\r\n', '5.9.3'],
  ['prerelease build', 'Version 5.9.3-beta.1+build.2\n', '5.9.3-beta.1+build.2'],
  ['pnpm prelude', 'Lockfile is up to date\r\nUpdate available! 11.22.0 -> 11.23.0\r\nVersion 5.9.3\r\n', '5.9.3'],
  ['notice only', 'Update available! 11.22.0 -> 11.23.0\n', 'UNAVAILABLE'],
  ['embedded fake', 'warning: Version 5.9.3\n', 'UNAVAILABLE'],
  ['duplicate lines', 'Version 5.9.3\nVersion 5.9.3\n', 'UNAVAILABLE'],
  ['conflicting lines', '5.9.3\n11.22.0\n', 'UNAVAILABLE'],
  ['invalid version', 'Version 5.9\n', 'UNAVAILABLE'],
  ['empty', '', 'UNAVAILABLE'],
]) {
  test('actual version parser: ' + name, () => assert.equal(parse(output), expected));
}
test('nonzero command cannot provide valid version evidence', () => {
  assert.equal(parse('Version 5.9.3\n', 1), 'UNAVAILABLE');
  assert.equal(parse('Version 5.9.3\n', null), 'UNAVAILABLE');
});
test('negative control: previous whole-output parser rejects pnpm prelude', () => {
  const output = 'Lockfile is up to date\nUpdate available! 11.22.0 -> 11.23.0\nVersion 5.9.3\n';
  assert.equal(oldParse(output), 'UNAVAILABLE');
  assert.equal(parse(output), '5.9.3');
});
test('actual environment retains only required installation roots and fixture settings', () => {
  const inherited = {
    ProgramFiles: 'C:\\Program Files', ProgramW6432: 'C:\\Program Files',
    PATH: 'fixture-path', DATABASE_URL: 'forbidden-parent-database',
    CONNECTION_ENCRYPTION_KEYS: 'forbidden-parent-key', AUTH_JWT_SECRET: 'forbidden-parent-jwt',
    SMTP_PASSWORD: 'forbidden-parent-smtp', NODE_ENV: 'production',
    DOCKER_HOST: 'forbidden-parent-endpoint', DOCKER_CONFIG: 'forbidden-parent-config',
  };
  const actual = environment(inherited);
  assert.equal(actual.ProgramFiles, inherited.ProgramFiles);
  assert.equal(actual.ProgramW6432, inherited.ProgramW6432);
  assert.equal(actual.PATH, 'fixture-path');
  assert.equal(actual.NODE_ENV, 'test');
  assert.equal(actual.FIXTURE_SENTINEL, 'public-fixture');
  for (const key of ['DATABASE_URL', 'CONNECTION_ENCRYPTION_KEYS', 'AUTH_JWT_SECRET', 'SMTP_PASSWORD', 'DOCKER_HOST', 'DOCKER_CONFIG'])
    assert.equal(Object.hasOwn(actual, key), false, key + ' must not be inherited');
});
test('missing installation roots do not introduce undefined environment values', () => {
  const actual = environment({ ProgramFiles: '', ProgramW6432: undefined });
  assert.equal(Object.hasOwn(actual, 'ProgramFiles'), false);
  assert.equal(Object.hasOwn(actual, 'ProgramW6432'), false);
});
test('negative control: previous whitelist omits both plugin installation roots', () => {
  const previous = envLoop.replace(/^\s*"ProgramFiles",\s*$/m, '').replace(/^\s*"ProgramW6432",\s*$/m, '');
  assert.notEqual(previous, envLoop);
  const inherited = { ProgramFiles: 'C:\\Program Files', ProgramW6432: 'C:\\Program Files' };
  const old = environment(inherited, previous);
  assert.equal(Object.hasOwn(old, 'ProgramFiles'), false);
  assert.equal(Object.hasOwn(old, 'ProgramW6432'), false);
  assert.equal(environment(inherited).ProgramFiles, inherited.ProgramFiles);
});
test('real Windows Compose plugin discovery: new whitelist succeeds, old fails', {
  skip: process.platform !== 'win32' ? 'Windows-only installation-root contract' : false,
}, () => {
  // Read only explicitly allowlisted OS variables; never capture business secrets.
  const actual = environment(process.env);
  const prior = { ...actual };
  delete prior.ProgramFiles;
  delete prior.ProgramW6432;
  const run = env => spawnSync('docker', ['compose', 'version'], {
    cwd: root, env, shell: true, windowsHide: true, timeout: 30_000, encoding: 'utf8',
  });
  const corrected = run(actual);
  assert.equal(corrected.status, 0, 'Compose must be discoverable in corrected isolated environment');
  assert.match(corrected.stdout, /^Docker Compose version v?\d+\.\d+\.\d+/m);
  const previous = run(prior);
  assert.notEqual(previous.status, 0, 'negative control must fail on this installation; other Windows installations need a dedicated fixture');
});
test('safety suite minimum and stage completion boundary remain unchanged', () => {
  assert.match(source, /counts\.numPassedTests\s*<\s*185/);
  assert.match(source, /completeStageEligible:\s*false/);
  assert.match(source, /contractStatus === "PASS"\s*\? "PARTIAL"/);
});
