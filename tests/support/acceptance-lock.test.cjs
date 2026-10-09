const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');
const Module = require('node:module');
const ts = require('../../backend-node/node_modules/typescript');
const checkout = path.resolve(__dirname, '../..');
const sourcePath = path.join(__dirname, 'acceptance-lock.ts');

async function actualModule() {
  const source = await fs.readFile(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = new Module(sourcePath, module);
  loaded.filename = sourcePath;
  loaded.paths = module.paths;
  loaded._compile(output, sourcePath);
  return loaded.exports;
}

function lockPath(root) { return path.join(root, 'artifacts/acceptance/.workspace.lock'); }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-lock-test-'));
  t.after(async () => {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.ok(path.basename(root).startsWith('nexus-lock-test-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}
function child(t, root) {
  const process_ = fork(__filename, [], {
    env: { ...process.env, NEXUS_LOCK_CHILD_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  });
  const queued = [];
  const waiters = [];
  process_.on('message', message => {
    const waiter = waiters.shift();
    if (waiter) waiter(message); else queued.push(message);
  });
  let stderr = '';
  process_.stderr.on('data', data => { stderr += data; });
  const exited = new Promise(resolve => process_.once('exit', (code, signal) => resolve({ code, signal, stderr })));
  t.after(async () => { if (process_.exitCode === null && process_.signalCode === null) process_.kill(); await exited; });
  return {
    process_, exited,
    next: () => queued.length ? Promise.resolve(queued.shift()) : new Promise(resolve => waiters.push(resolve)),
  };
}

if (process.env.NEXUS_LOCK_CHILD_ROOT) {
  void (async () => {
    const { withAcceptanceLock, AcceptanceWorkspaceBusy } = await actualModule();
    process.send('ready');
    await new Promise(resolve => process.once('message', resolve));
    try {
      await withAcceptanceLock(process.env.NEXUS_LOCK_CHILD_ROOT, async () => {
        process.send('entered');
        await new Promise(resolve => process.once('message', resolve));
      });
      process.send('released');
    } catch (error) {
      process.send(error instanceof AcceptanceWorkspaceBusy ? 'busy' : 'unexpected:' + error.message);
    }
    process.disconnect();
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  test('successful action returns its value and releases the real file lock', async t => {
    const root = await fixture(t);
    const { withAcceptanceLock } = await actualModule();
    assert.equal(await withAcceptanceLock(root, async () => {
      const identity = JSON.parse(await fs.readFile(lockPath(root), 'utf8'));
      assert.equal(identity.pid, process.pid);
      assert.match(identity.token, /^[0-9a-f-]{36}$/);
      return 42;
    }), 42);
    await assert.rejects(fs.stat(lockPath(root)), { code: 'ENOENT' });
    assert.equal(await withAcceptanceLock(root, async () => 'reacquired'), 'reacquired');
  });

  test('throwing action releases lock and preserves the original exception', async t => {
    const root = await fixture(t);
    const { withAcceptanceLock } = await actualModule();
    const failure = new Error('sentinel-action-error');
    await assert.rejects(withAcceptanceLock(root, async () => { throw failure; }), error => error === failure);
    await assert.rejects(fs.stat(lockPath(root)), { code: 'ENOENT' });
    await withAcceptanceLock(root, async () => undefined);
  });

  test('preexisting lock rejects before action and cannot overwrite bytes', async t => {
    const root = await fixture(t);
    const { withAcceptanceLock, AcceptanceWorkspaceBusy } = await actualModule();
    await fs.mkdir(path.dirname(lockPath(root)), { recursive: true });
    const original = 'operator-owned-lock';
    await fs.writeFile(lockPath(root), original);
    let invoked = false;
    await assert.rejects(withAcceptanceLock(root, async () => { invoked = true; }), AcceptanceWorkspaceBusy);
    assert.equal(invoked, false);
    assert.equal(await fs.readFile(lockPath(root), 'utf8'), original);
  });

  test('in-process concurrent attempts run exactly one action via wx', async t => {
    const root = await fixture(t);
    const { withAcceptanceLock, AcceptanceWorkspaceBusy } = await actualModule();
    let entered = 0;
    let release;
    const held = new Promise(resolve => { release = resolve; });
    let notify;
    const acquired = new Promise(resolve => { notify = resolve; });
    const winner = withAcceptanceLock(root, async () => { entered++; notify(); await held; });
    await acquired;
    try {
      const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => withAcceptanceLock(root, async () => { entered++; })));
      for (const attempt of attempts) {
        assert.equal(attempt.status, 'rejected');
        assert.ok(attempt.reason instanceof AcceptanceWorkspaceBusy);
      }
      assert.equal(entered, 1);
    } finally { release(); await winner; }
    await assert.rejects(fs.stat(lockPath(root)), { code: 'ENOENT' });
  });

  test('two independent processes starting together execute exactly one action', { timeout: 20000 }, async t => {
    const root = await fixture(t);
    const contenders = [child(t, root), child(t, root)];
    assert.deepEqual(await Promise.all(contenders.map(item => item.next())), ['ready', 'ready']);
    contenders.forEach(item => item.process_.send('start'));
    const results = await Promise.all(contenders.map(item => item.next()));
    assert.deepEqual([...results].sort(), ['busy', 'entered']);
    const winner = contenders[results.indexOf('entered')];
    winner.process_.send('release');
    assert.equal(await winner.next(), 'released');
    for (const result of await Promise.all(contenders.map(item => item.exited))) assert.equal(result.code, 0, result.stderr);
    await assert.rejects(fs.stat(lockPath(root)), { code: 'ENOENT' });
  });

  test('crashed owner leaves stale lock; successor never automatically steals it', { timeout: 20000 }, async t => {
    const root = await fixture(t);
    const owner = child(t, root);
    assert.equal(await owner.next(), 'ready');
    owner.process_.send('start');
    assert.equal(await owner.next(), 'entered');
    const before = await fs.readFile(lockPath(root), 'utf8');
    owner.process_.kill('SIGKILL');
    await owner.exited;
    const { withAcceptanceLock, AcceptanceWorkspaceBusy } = await actualModule();
    let invoked = false;
    await assert.rejects(withAcceptanceLock(root, async () => { invoked = true; }), AcceptanceWorkspaceBusy);
    assert.equal(invoked, false);
    assert.equal(await fs.readFile(lockPath(root), 'utf8'), before);
  });

  test('ownership replacement during action is preserved and reported', async t => {
    const root = await fixture(t);
    const { withAcceptanceLock } = await actualModule();
    const replacement = JSON.stringify({ pid: 1, token: 'replacement-owner' });
    await assert.rejects(withAcceptanceLock(root, async () => {
      await fs.writeFile(lockPath(root), replacement);
    }), { message: 'ACCEPTANCE_LOCK_OWNERSHIP_CHANGED' });
    assert.equal(await fs.readFile(lockPath(root), 'utf8'), replacement);
  });

  test('P00/P01/P02 acquire exactly once; routing imports do not nest locks', async () => {
    const paths = ['scripts/verify-stage.ts', 'scripts/verify-p02.ts', 'tests/acceptance/P01/verify-local.ts'];
    for (const filename of paths) {
      const source = await fs.readFile(path.join(checkout, filename), 'utf8');
      const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
      const calls = [];
      const visit = node => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'withAcceptanceLock') calls.push(node);
        ts.forEachChild(node, visit);
      };
      visit(ast);
      assert.equal(calls.length, 1, filename);
      assert.equal(calls[0].arguments[0].getText(ast), 'root', filename);
      assert.equal(calls[0].arguments[1].getText(ast), 'main', filename);
      assert.ok(ast.statements.some(node => ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith('/acceptance-lock.js')), filename);
      if (filename === paths[0]) {
        const gate = calls[0].parent;
        assert.ok(ts.isConditionalExpression(gate));
        assert.equal(gate.whenFalse, calls[0]);
        assert.equal(gate.whenTrue.getText(ast), 'main()');
        assert.match(gate.condition.getText(ast), /stage\s*===\s*['"]P01['"]\s*\|\|\s*stage\s*===\s*['"]P02['"]/);
        assert.match(source, /await import\(['"]\.\.\/tests\/acceptance\/P01\/verify-local\.js['"]\)/);
        assert.match(source, /await import\(['"]\.\/verify-p02\.js['"]\)/);
      }
    }
  });
}
