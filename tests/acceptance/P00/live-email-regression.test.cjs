const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('../../../backend-node/node_modules/typescript');

// Execute the actual smoke implementation. Only the human input function is
// replaced by an AST transform; HTTP/files/TTY are isolated injected boundaries.
// Never load .env, SMTP credentials, a real inbox, or a database.
const sourcePath = path.resolve(__dirname, 'live-email-smoke.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  transformers: { before: [(context) => {
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'hiddenInput') {
        return context.factory.updateFunctionDeclaration(node, node.modifiers,
          node.asteriskToken, node.name, node.typeParameters, node.parameters,
          node.type, context.factory.createBlock([
            context.factory.createReturnStatement(context.factory.createCallExpression(
              context.factory.createIdentifier('__input'), undefined, [])),
          ], true));
      }
      return ts.visitEachChild(node, visit, context);
    };
    return (root) => ts.visitNode(root, visit);
  }] },
}).outputText;
const EMAIL = 'contract-recipient@example.test';
const BASE = 'http://127.0.0.1:31060/';
const ORIGIN = 'http://localhost:5175';
const CHALLENGE = 'd618b727-bdbc-4e63-b7f8-e995487176a0';
const TOKEN = 'contract-access-token-private';
const COOKIE = 'refresh=contract-cookie-private; HttpOnly; Secure';
const OTP = '431276';
const MESSAGE = '<contract-real-message@example.test>';
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const pending = (overrides = {}) => ({ caseId: 'P00-AUTH-LIVE', status: 'PENDING',
  recipientHash: hash(EMAIL), apiBase: BASE, origin: ORIGIN,
  challengeId: CHALLENGE, sentAt: new Date().toISOString(), ...overrides });
const envelope = (data) => ({ errCode: 0, data });

function harness(options = {}) {
  const files = new Map();
  const requests = [];
  const logs = [];
  const inputs = [...(options.inputs || [OTP, MESSAGE])];
  const proc = { env: { LIVE_INTEGRATION: '1', LIVE_TEST_EMAIL: EMAIL,
    LIVE_EMAIL_ALLOWED_RECIPIENT: EMAIL, LIVE_API_URL: BASE,
    LIVE_ORIGIN: ORIGIN, P00_ARTIFACT_DIR: path.resolve('mock-artifacts'),
    ...options.env }, stdin: { isTTY: options.tty ?? true }, exitCode: 0,
    argv: [], stdout: { write: (value) => logs.push(value) } };
  const pendingFile = path.resolve(proc.env.P00_ARTIFACT_DIR || 'mock-artifacts', 'pending-email.json');
  if (options.pending !== undefined) files.set(pendingFile, JSON.stringify(options.pending));
  if (options.intent) files.set(path.resolve(proc.env.P00_ARTIFACT_DIR, 'send-intent.json'), JSON.stringify({ status: 'SEND_INTENT' }));
  let whoamiCount = 0;
  const missing = () => Object.assign(new Error('Mock file missing'), { code: 'ENOENT' });
  const io = {
    mkdir: async () => {},
    lstat: async (file) => { if (!files.has(file)) throw missing(); return {}; },
    readFile: async (file) => { if (!files.has(file)) throw missing(); return files.get(file); },
    writeFile: async (file, value, flags) => {
      if (flags?.flag === 'wx' && files.has(file)) throw Object.assign(new Error('Exists'), { code: 'EEXIST' });
      files.set(file, value);
    },
  };
  const mockFetch = async (url, init = {}) => {
    const route = new URL(url).pathname;
    requests.push({ route, init });
    let status = 200;
    let body;
    let cookie = null;
    if (route.endsWith('/auth/email/code')) {
      status = options.codeStatus ?? 200;
      body = options.challengeBody ?? envelope({ challengeId: CHALLENGE });
    } else if (route.endsWith('/auth/email/login')) {
      status = options.loginStatus ?? 200;
      body = options.loginBody ?? envelope({ accessToken: TOKEN, user: { id: '73', email: EMAIL } });
      cookie = options.cookie === undefined ? COOKIE : options.cookie;
    } else if (route.endsWith('/auth/logout')) {
      status = options.logoutStatus ?? 204;
    } else if (route.endsWith('/UserAccount/GetCurrentUser')) {
      whoamiCount++;
      status = whoamiCount === 1 ? (options.identityStatus ?? 200) : (options.revokedStatus ?? 401);
      body = options.identityBody ?? envelope({ UserId: '73', Email: EMAIL });
    } else throw new Error('Unexpected mock endpoint');
    return { ok: status >= 200 && status < 300, status,
      json: async () => body, headers: { get: (name) => name === 'set-cookie' ? cookie : null } };
  };
  const module = { exports: {} };
  const mockRequire = (id) => {
    if (id === 'node:fs/promises') return io;
    if (id.includes('redaction')) return { redact: (value) => value };
    if (!id.startsWith('node:')) throw new Error('Unapproved module dependency');
    return require(id);
  };
  mockRequire.main = {};
  vm.runInNewContext(compiled, { module, exports: module.exports,
    require: mockRequire, process: proc, console: { log: (value) => logs.push(value), error: (value) => logs.push(value) },
    fetch: mockFetch, URL, AbortSignal, Date, setTimeout, clearTimeout,
    __input: async () => { if (!inputs.length) throw new Error('No mock human input'); return inputs.shift(); },
  }, { filename: sourcePath });
  return { ...module.exports, proc, requests, files, logs,
    report: () => JSON.parse(files.get(path.resolve(proc.env.P00_ARTIFACT_DIR, 'live-email.json')) || 'null'),
    pendingReport: () => JSON.parse(files.get(pendingFile) || 'null') };
}

test('Import has zero HTTP or filesystem side effects', () => {
  const h = harness(); assert.equal(h.requests.length, 0); assert.equal(h.files.size, 0);
});
test('apiData extracts the actual nested success envelope', () => {
  assert.equal(harness().apiData(envelope({ challengeId: CHALLENGE })).challengeId, CHALLENGE);
});
for (const [name, value] of Object.entries({ null: null, array: [], string: 'bad',
  oldDTO: { challengeId: CHALLENGE }, error: { errCode: 1, data: {} },
  stringCode: { errCode: '0', data: {} }, missingData: { errCode: 0 },
  arrayData: { errCode: 0, data: [] }, nullData: { errCode: 0, data: null } })) {
  test(`apiData rejects ${name}`, () => assert.throws(() => harness().apiData(value), /Invalid API envelope/));
}
test('Valid bound pending metadata is accepted', () => {
  assert.equal(harness().validatePending(pending(), EMAIL, BASE, ORIGIN).challengeId, CHALLENGE);
});
for (const [name, patch] of Object.entries({ wrongCase: { caseId: 'P00-OTHER' },
  falsePASS: { status: 'PASS' }, recipient: { recipientHash: hash('other@example.test') },
  base: { apiBase: 'http://localhost:31061/' }, origin: { origin: 'https://other.test' },
  challenge: { challengeId: '------------------------------------' },
  wrongUUIDVersion: { challengeId: CHALLENGE.replace('-4e63-', '-3e63-') },
  expired: { sentAt: new Date(Date.now() - 301000).toISOString() },
  future: { sentAt: new Date(Date.now() + 10000).toISOString() }, invalidDate: { sentAt: 'never' } })) {
  test(`Pending rejects ${name}`, () => assert.throws(() => harness().validatePending(pending(patch), EMAIL, BASE, ORIGIN)));
}
test('send-only sends exactly once and writes PENDING without login or secrets', async () => {
  const h = harness({ tty: false }); await h.run('send-only');
  assert.equal(h.proc.exitCode, 2); assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].route, '/auth/email/code');
  assert.equal(h.pendingReport().status, 'PENDING'); assert.equal(h.report(), null);
  assert.equal(h.pendingReport().recipientHash, hash(EMAIL));
  const text = [...h.files.values(), ...h.logs].join('\n');
  for (const secret of [EMAIL, OTP, TOKEN, COOKIE, MESSAGE]) assert.equal(text.includes(secret), false);
});
test('send-only with existing pending cannot resend', async () => {
  const h = harness({ pending: pending(), tty: false });
  await assert.rejects(h.run('send-only'), /already exists/); assert.equal(h.requests.length, 0);
});
test('Concurrent send-only attempts in the same directory send at most once', async () => {
  const h = harness({ tty: false });
  const results = await Promise.allSettled([h.run('send-only'), h.run('send-only')]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(h.requests.length, 1); assert.equal(h.pendingReport().status, 'PENDING');
});
test('An existing intent without pending forbids resend before any HTTP request', async () => {
  const h = harness({ tty: false, intent: true });
  await assert.rejects(h.run('send-only'), (error) => error.code === 'EEXIST');
  assert.equal(h.requests.length, 0); assert.equal(h.pendingReport(), null);
});
test('Failed remote request retains intent and cannot blindly resend', async () => {
  const h = harness({ tty: false, codeStatus: 503 });
  await assert.rejects(h.run('send-only'));
  assert.equal(h.pendingReport(), null);
  await assert.rejects(h.run('send-only'));
  assert.equal(h.requests.length, 1);
});
for (const mode of ['interactive', 'complete']) {
  test(`${mode} without TTY blocks before sending`, async () => {
    const h = harness({ tty: false }); await h.run(mode);
    assert.equal(h.proc.exitCode, 2); assert.equal(h.requests.length, 0); assert.equal(h.report(), null);
  });
}
for (const [name, env] of Object.entries({ permission: { LIVE_INTEGRATION: '0' },
  email: { LIVE_TEST_EMAIL: '' }, allowlist: { LIVE_EMAIL_ALLOWED_RECIPIENT: 'other@example.test' },
  base: { LIVE_API_URL: '' }, origin: { LIVE_ORIGIN: '' } })) {
  test(`Missing authorization ${name} prevents all requests`, async () => {
    const h = harness({ env, tty: false }); await h.run('send-only');
    assert.equal(h.proc.exitCode, 2); assert.equal(h.requests.length, 0);
  });
}
for (const base of ['http://remote.example.test/', 'https://user:password@example.test/', 'https://example.test/?x=1']) {
  test(`Unsafe API URL ${new URL(base).hostname} is rejected without requests`, async () => {
    const h = harness({ env: { LIVE_API_URL: base } });
    await assert.rejects(h.run('send-only')); assert.equal(h.requests.length, 0);
  });
}
test('Missing artifact directory prevents sending', async () => {
  const h = harness({ env: { P00_ARTIFACT_DIR: '' } });
  await assert.rejects(h.run('send-only')); assert.equal(h.requests.length, 0);
});
test('complete cannot silently send if pending is missing', async () => {
  const h = harness(); await assert.rejects(h.run('complete')); assert.equal(h.requests.length, 0);
});
test('complete cannot silently send if pending expired', async () => {
  const h = harness({ pending: pending({ sentAt: new Date(Date.now() - 301000).toISOString() }) });
  await assert.rejects(h.run('complete')); assert.equal(h.requests.length, 0);
});
test('complete authenticates nested envelope, logs out and checks revoked token, without resending', async () => {
  const h = harness({ pending: pending() }); await h.run('complete');
  assert.deepEqual(h.requests.map((r) => r.route), ['/auth/email/login', '/UserAccount/GetCurrentUser', '/auth/logout', '/UserAccount/GetCurrentUser']);
  assert.equal(JSON.parse(h.requests[0].init.body).code, OTP);
  assert.equal(h.requests[2].init.headers.cookie, COOKIE.split(';')[0]);
  assert.equal(h.report().status, 'PASS'); assert.equal(h.report().loggedOut, true);
  assert.equal(h.report().messageIdSha256, hash(MESSAGE));
  const text = [...h.files.values(), ...h.logs].join('\n');
  for (const secret of [EMAIL, OTP, TOKEN, COOKIE, MESSAGE]) assert.equal(text.includes(secret), false);
});
test('interactive flow requests only one code then completes actual login', async () => {
  const h = harness(); await h.run(); assert.equal(h.requests.filter((r) => r.route === '/auth/email/code').length, 1);
  assert.equal(h.report().status, 'PASS');
});
for (const [name, options] of Object.entries({ badOTP: { inputs: ['12', MESSAGE] },
  noMessage: { inputs: [OTP, ''] }, placeholderMessage: { inputs: [OTP, 'not-provided'] },
  newlineMessage: { inputs: [OTP, 'x\ny'] } })) {
  test(`Invalid manual evidence ${name} cannot login or PASS`, async () => {
    const h = harness({ pending: pending(), ...options });
    await h.run('complete').catch(() => {});
    assert.equal(h.requests.length, 0); assert.equal(h.report(), null);
  });
}
for (const [name, options] of Object.entries({ loginDenied: { loginStatus: 401 },
  oldLoginDTO: { loginBody: { accessToken: TOKEN, user: { id: '73', email: EMAIL } } },
  errorEnvelope: { loginBody: { errCode: 9, data: {} } },
  wrongIdentity: { loginBody: envelope({ accessToken: TOKEN, user: { id: '73', email: 'other@example.test' } }) },
  missingCookie: { cookie: null }, nonHttpOnly: { cookie: 'refresh=private' },
  authenticatedDenied: { identityStatus: 403 }, identityMismatch: { identityBody: envelope({ UserId: '74', Email: EMAIL }) },
  logoutFailed: { logoutStatus: 500 }, fakeLogout: { revokedStatus: 200 } })) {
  test(`Failure ${name} must never publish PASS`, async () => {
    const h = harness({ pending: pending(), ...options });
    await assert.rejects(h.run('complete')); assert.equal(h.report(), null);
    if (!['loginDenied', 'missingCookie'].includes(name)) {
      assert.equal(h.requests.filter((r) => r.route === '/auth/logout').length, 1);
    }
  });
}
test('SMTP/API denial cannot create pending evidence', async () => {
  const h = harness({ codeStatus: 503 }); await assert.rejects(h.run('send-only')); assert.equal(h.pendingReport(), null);
});
test('Old top-level challenge response cannot create pending evidence', async () => {
  const h = harness({ challengeBody: { challengeId: CHALLENGE } });
  await assert.rejects(h.run('send-only')); assert.equal(h.pendingReport(), null);
});
test('Invalid UUID challenge cannot create unusable pending evidence', async () => {
  const h = harness({ challengeBody: envelope({ challengeId: '------------------------------------' }) });
  await assert.rejects(h.run('send-only')); assert.equal(h.pendingReport(), null);
});
