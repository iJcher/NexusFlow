/** Mocked DNS/HTTPS transport contract tests; not a real TLS or network-egress acceptance. */
import { resolve4 } from 'node:dns/promises';
import { EventEmitter } from 'node:events';
import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';
import type { RequestOptions } from 'node:https';
import { PassThrough } from 'node:stream';
import {
  publicIPv4,
  resolveApprovedTarget,
} from '../../src/security/outbound-policy';
import { safeFetch } from '../../src/security/safe-fetch';

jest.mock('node:dns/promises', () => ({ resolve4: jest.fn() }));
jest.mock('node:https', () => ({ request: jest.fn() }));

const dns = jest.mocked(resolve4);
const httpsRequest = jest.mocked(request);
const target = 'https://api.example.test/v1';
let incoming: PassThrough & {
  statusCode: number;
  headers: Record<string, string>;
};
let req: EventEmitter & { end: jest.Mock; destroy: jest.Mock };
let options: RequestOptions;
let deliver: () => void;

beforeEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
  process.env.OUTBOUND_ALLOWED_HOSTS = 'api.example.test';
  dns.mockResolvedValue(['8.8.8.8']);
  incoming = Object.assign(new PassThrough(), { statusCode: 200, headers: {} });
  req = Object.assign(new EventEmitter(), {
    end: jest.fn(),
    destroy: jest.fn(),
  });
  const implementation = (
    _url: URL,
    config: RequestOptions,
    callback: (value: IncomingMessage) => void,
  ) => {
    options = config;
    deliver = () => callback(incoming as unknown as IncomingMessage);
    return req;
  };
  httpsRequest.mockImplementation(implementation as unknown as typeof request);
});

afterEach(() => {
  incoming.destroy();
  jest.useRealTimers();
  delete process.env.OUTBOUND_ALLOWED_HOSTS;
});

async function start(init: RequestInit = {}) {
  const result = safeFetch(target, init);
  // Wait for the bounded asynchronous DNS resolution to reach request construction.
  for (let step = 0; step < 12 && !httpsRequest.mock.calls.length; step++)
    await Promise.resolve();
  expect(httpsRequest).toHaveBeenCalledTimes(1);
  return { result };
}

describe('P01 outbound destination policy', () => {
  it.each([
    'http://api.example.test/',
    'https://api.example.test:444/',
    'https://user:password@api.example.test/',
    'https://api.example.test/#secret',
    'https://api.example.test.evil.invalid/',
    'https://evilapi.example.test/',
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://[::1]/',
    'https://api.example.test./',
    'not-a-url',
  ])('rejects unauthorized destination %s before DNS', async (url) => {
    await expect(resolveApprovedTarget(url)).rejects.toThrow('OUTBOUND_POLICY');
    expect(dns).not.toHaveBeenCalled();
  });

  it.each([
    '0.1.2.3',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    'garbage',
  ])('rejects non-public address %s', async (address) => {
    expect(publicIPv4(address)).toBe(false);
    dns.mockResolvedValue([address]);
    await expect(resolveApprovedTarget(target)).rejects.toThrow(
      'OUTBOUND_POLICY',
    );
  });

  it('rejects mixed public/private DNS answers and empty answers', async () => {
    dns
      .mockResolvedValueOnce(['8.8.8.8', '127.0.0.1'])
      .mockResolvedValueOnce([]);
    await expect(resolveApprovedTarget(target)).rejects.toThrow(
      'OUTBOUND_POLICY',
    );
    await expect(resolveApprovedTarget(target)).rejects.toThrow(
      'OUTBOUND_POLICY',
    );
  });

  it('requires explicit exact host approval and uses the first verified address', async () => {
    await expect(resolveApprovedTarget(target, '')).rejects.toThrow(
      'OUTBOUND_POLICY',
    );
    dns.mockResolvedValue(['8.8.8.8', '1.1.1.1']);
    await expect(
      resolveApprovedTarget(target, ' API.EXAMPLE.TEST '),
    ).resolves.toEqual({ url: new URL(target), address: '8.8.8.8' });
  });

  it('bounds a hanging DNS resolution', async () => {
    jest.useFakeTimers();
    dns.mockImplementation(() => new Promise(() => undefined));
    const result = resolveApprovedTarget(target);
    const assertion = expect(result).rejects.toThrow('OUTBOUND_DNS_TIMEOUT');
    await jest.advanceTimersByTimeAsync(5000);
    await assertion;
  });
});

describe('P01 safe HTTPS transport', () => {
  it('pins checked IPv4, disables pooling and preserves TLS verification without a second DNS lookup', async () => {
    const { result } = await start();
    expect(options).toEqual(
      expect.objectContaining({
        agent: false,
        family: 4,
        rejectUnauthorized: true,
      }),
    );
    const callback = jest.fn();
    const lookup = options.lookup as (
      host: string,
      config: object,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void;
    dns.mockResolvedValue(['127.0.0.1']);
    lookup('api.example.test', {}, callback);
    expect(callback).toHaveBeenCalledWith(null, '8.8.8.8', 4);
    expect(dns).toHaveBeenCalledTimes(1);
    deliver();
    incoming.end('ok');
    expect(await (await result).text()).toBe('ok');
  });

  it.each(['Host', 'Connection', 'Content-Length', 'Transfer-Encoding'])(
    'rejects caller-controlled %s',
    async (name) => {
      await expect(
        safeFetch(target, { headers: { [name]: 'unsafe' } }),
      ).rejects.toThrow('OUTBOUND_HEADER_POLICY');
      expect(httpsRequest).not.toHaveBeenCalled();
    },
  );

  it.each([new Uint8Array([1]), 'a'.repeat(1048577), 'é'.repeat(524289)])(
    'rejects non-string or oversized UTF-8 request bodies',
    async (body) => {
      await expect(safeFetch(target, { method: 'POST', body })).rejects.toThrow(
        'OUTBOUND_REQUEST_LIMIT',
      );
      expect(httpsRequest).not.toHaveBeenCalled();
    },
  );

  it.each([
    { method: 'CONNECT' },
    { method: 'GET', body: 'x' },
    { method: 'HEAD', body: 'x' },
  ])('rejects unsafe method/body pairing %j', async (init) => {
    await expect(safeFetch(target, init)).rejects.toThrow(
      'OUTBOUND_METHOD_POLICY',
    );
  });

  it('allows exactly one MiB and passes authorization headers without exposing or redirecting them', async () => {
    const body = 'a'.repeat(1048576);
    const { result } = await start({
      method: 'POST',
      body,
      headers: { authorization: 'Bearer test-only' },
    });
    expect(req.end).toHaveBeenCalledWith(body);
    expect(options.headers).toEqual({ authorization: 'Bearer test-only' });
    deliver();
    incoming.end();
    await (await result).text();
  });

  it.each([301, 302, 307, 308])(
    'does not follow redirect %i',
    async (status) => {
      const { result } = await start();
      const assertion = expect(result).rejects.toThrow(
        'OUTBOUND_REDIRECT_OR_STATUS',
      );
      incoming.statusCode = status;
      incoming.headers.location = 'http://169.254.169.254/';
      deliver();
      await assertion;
      expect(httpsRequest).toHaveBeenCalledTimes(1);
      expect(req.destroy).toHaveBeenCalled();
      expect(incoming.destroyed).toBe(true);
    },
  );

  it('delivers response headers before body completion and pauses unread streaming data', async () => {
    const { result } = await start();
    deliver();
    const response = await result;
    expect(response.status).toBe(200);
    incoming.write(Buffer.alloc(1024));
    expect(incoming.isPaused()).toBe(true);
    await response.body!.cancel();
    expect(req.destroy).toHaveBeenCalled();
    expect(incoming.destroyed).toBe(true);
  });

  it('enforces a cumulative two MiB response limit even when consumed continuously', async () => {
    const { result } = await start();
    deliver();
    const response = await result;
    const reader = response.body!.getReader();
    for (let index = 0; index < 2; index++) {
      const read = reader.read();
      incoming.write(Buffer.alloc(1048576));
      expect((await read).value?.byteLength).toBe(1048576);
    }
    const assertion = expect(reader.read()).rejects.toThrow(
      'OUTBOUND_RESPONSE_LIMIT',
    );
    incoming.write(Buffer.alloc(1));
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
    expect(incoming.destroyed).toBe(true);
  });

  it('aborts before DNS without constructing a request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      safeFetch(target, { signal: controller.signal }),
    ).rejects.toThrow('OUTBOUND_ABORTED');
    expect(dns).not.toHaveBeenCalled();
  });

  it('aborts pending headers and releases transport resources', async () => {
    const controller = new AbortController();
    const { result } = await start({ signal: controller.signal });
    const assertion = expect(result).rejects.toThrow('OUTBOUND_ABORTED');
    controller.abort();
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
  });

  it('aborts after headers and errors the response reader', async () => {
    const controller = new AbortController();
    const { result } = await start({ signal: controller.signal });
    deliver();
    const reader = (await result).body!.getReader();
    const assertion = expect(reader.read()).rejects.toThrow('OUTBOUND_ABORTED');
    controller.abort();
    await assertion;
    expect(incoming.destroyed).toBe(true);
  });

  it.each(['error', 'aborted'])(
    'does not silently accept an interrupted response (%s)',
    async (event) => {
      const { result } = await start();
      deliver();
      const reader = (await result).body!.getReader();
      const assertion = expect(reader.read()).rejects.toThrow(
        'OUTBOUND_RESPONSE_LOST',
      );
      incoming.emit(event, new Error('test-only transport detail'));
      await assertion;
      expect(req.destroy).toHaveBeenCalled();
    },
  );

  it('has an absolute deadline for never-ending response streams', async () => {
    jest.useFakeTimers();
    const { result } = await start();
    deliver();
    const reader = (await result).body!.getReader();
    const assertion = expect(reader.read()).rejects.toThrow('OUTBOUND_TIMEOUT');
    await jest.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
    expect(incoming.destroyed).toBe(true);
  });

  it('rejects transport failure before headers without leaking its message', async () => {
    const { result } = await start();
    const assertion = expect(result).rejects.toThrow('OUTBOUND_TRANSPORT_LOST');
    req.emit('error', new Error('authorization=test-only-secret'));
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
  });

  it('times out before headers rather than leaving the fetch pending', async () => {
    jest.useFakeTimers();
    const { result } = await start();
    const assertion = expect(result).rejects.toThrow('OUTBOUND_TIMEOUT');
    await jest.advanceTimersByTimeAsync(30000);
    await assertion;
    expect(req.destroy).toHaveBeenCalled();
  });

  it('releases deadline and abort listeners after normal stream completion', async () => {
    jest.useFakeTimers();
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    const { result } = await start({ signal: controller.signal });
    deliver();
    incoming.end('complete');
    expect(await (await result).text()).toBe('complete');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    await jest.advanceTimersByTimeAsync(30000);
    expect(req.destroy).not.toHaveBeenCalled();
  });

  it('surfaces a premature close without end immediately rather than hanging until deadline', async () => {
    jest.useFakeTimers();
    const { result } = await start();
    deliver();
    const reader = (await result).body!.getReader();
    let outcome = 'pending';
    const read = reader.read().then(
      () => {
        outcome = 'resolved';
      },
      (error: unknown) => {
        outcome = error instanceof Error ? error.message : 'unknown';
      },
    );
    incoming.emit('close');
    await jest.advanceTimersByTimeAsync(0);
    expect(outcome).toBe('OUTBOUND_RESPONSE_LOST');
    await read;
    expect(req.destroy).toHaveBeenCalled();
  });

  it.each([
    { method: 'HEAD', status: 200 },
    { method: 'GET', status: 204 },
    { method: 'GET', status: 205 },
  ])(
    'handles no-body response %j without waiting for a body reader',
    async ({ method, status }) => {
      jest.useFakeTimers();
      const { result } = await start({ method });
      incoming.statusCode = status;
      deliver();
      incoming.end();
      const response = await result;
      expect(response.body).toBeNull();
      await jest.advanceTimersByTimeAsync(30000);
      expect(req.destroy).not.toHaveBeenCalled();
    },
  );
});
