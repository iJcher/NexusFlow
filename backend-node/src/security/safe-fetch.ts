import { request } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { resolveApprovedTarget } from './outbound-policy';

/** No redirect/proxy fallback, pinned DNS, bounded response, and absolute deadline. */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
): Promise<Response> {
  const startedAt = Date.now();
  if (init.signal?.aborted) throw new Error('OUTBOUND_ABORTED');
  const headers = new Headers(init.headers);
  for (const name of [
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
  ])
    if (headers.has(name)) throw new Error('OUTBOUND_HEADER_POLICY');
  if (
    init.body != null &&
    (typeof init.body !== 'string' || Buffer.byteLength(init.body) > 1048576)
  )
    throw new Error('OUTBOUND_REQUEST_LIMIT');
  const method = (init.method ?? 'GET').toUpperCase();
  if (
    !['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].includes(method) ||
    ((method === 'GET' || method === 'HEAD') && init.body != null)
  )
    throw new Error('OUTBOUND_METHOD_POLICY');
  const { url, address } = await resolveApprovedTarget(
    raw,
    undefined,
    init.signal,
  );
  if (init.signal?.aborted) throw new Error('OUTBOUND_ABORTED');
  return new Promise<Response>((resolve, reject) => {
    let response: IncomingMessage | undefined;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let settled = false;
    let finished = false;
    let bytes = 0;
    const cleanup = () => {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    };
    const fail = (code: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      const error = new Error(code);
      if (!settled) reject(error);
      else controller?.error(error);
      req.destroy();
      response?.destroy();
    };
    const abort = () => fail('OUTBOUND_ABORTED');
    const req = request(
      url,
      {
        method,
        agent: false,
        family: 4,
        rejectUnauthorized: true,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: Object.fromEntries(headers.entries()),
      },
      (incoming) => {
        response = incoming;
        const status = incoming.statusCode ?? 0;
        const noBody = method === 'HEAD' || [204, 205].includes(status);
        if (status < 200 || status > 599 || (status >= 300 && status < 400)) {
          fail('OUTBOUND_REDIRECT_OR_STATUS');
          return;
        }
        const body = new ReadableStream<Uint8Array>({
          start(value) {
            controller = value;
          },
          pull() {
            incoming.resume();
          },
          cancel() {
            fail('OUTBOUND_CANCELLED');
          },
        });
        incoming.on('data', (chunk: Buffer) => {
          if (finished) return;
          bytes += chunk.length;
          if (bytes > 2097152) {
            fail('OUTBOUND_RESPONSE_LIMIT');
            return;
          }
          if (!noBody) {
            controller!.enqueue(new Uint8Array(chunk));
            if ((controller!.desiredSize ?? 0) <= 0) incoming.pause();
          }
        });
        incoming.on('error', () => fail('OUTBOUND_RESPONSE_LOST'));
        incoming.on('aborted', () => fail('OUTBOUND_RESPONSE_LOST'));
        incoming.on('close', () => {
          if (!finished) fail('OUTBOUND_RESPONSE_LOST');
        });
        incoming.on('end', () => {
          if (finished) return;
          finished = true;
          cleanup();
          controller!.close();
        });
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (value !== undefined)
            responseHeaders.set(
              name,
              Array.isArray(value) ? value.join(', ') : value,
            );
        }
        settled = true;
        resolve(
          new Response(noBody ? null : body, {
            status,
            headers: responseHeaders,
          }),
        );
      },
    );
    const timer = setTimeout(
      () => fail('OUTBOUND_TIMEOUT'),
      Math.max(1, 30000 - (Date.now() - startedAt)),
    );
    timer.unref();
    req.on('error', () => fail('OUTBOUND_TRANSPORT_LOST'));
    init.signal?.addEventListener('abort', abort, { once: true });
    req.end(init.body ?? undefined);
  });
}
