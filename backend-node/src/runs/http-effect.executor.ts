import { resolve4 } from 'node:dns/promises';
import { isIP, BlockList } from 'node:net';
import { request } from 'node:https';
import { Injectable } from '@nestjs/common';
import {
  ExecutionContext,
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  assertJson,
  jsonString,
} from './contracts';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4');

@Injectable()
export class HttpEffectExecutor {
  async execute(
    spec: NodeSpec,
    inputs: JsonObject,
    context: ExecutionContext,
  ): Promise<Json> {
    const url = new URL(jsonString(spec.config?.url));
    const method = jsonString(spec.config?.method);
    const write = method === 'POST';
    const allowed = (process.env.WORKFLOW_HTTP_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    if (
      url.protocol !== 'https:' ||
      isIP(url.hostname) ||
      !allowed.includes(url.hostname) ||
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.port && url.port !== '443') ||
      !['GET', 'POST'].includes(method)
    ) {
      throw new ExecutionError('HTTP_POLICY');
    }
    if (context.signal.aborted) throw new ExecutionError('ABORTED');
    let addresses: string[];
    try {
      addresses = await resolve4(url.hostname);
    } catch {
      throw new ExecutionError('DNS_UNAVAILABLE', true);
    }
    if (
      !addresses.length ||
      addresses.some(
        (address) => !isIP(address) || blocked.check(address, 'ipv4'),
      )
    )
      throw new ExecutionError('HTTP_POLICY');
    if (context.signal.aborted) throw new ExecutionError('ABORTED');
    // Pin the validated IPv4 result; never resolve again between policy check and connect.
    // IPv6-only destinations are rejected rather than passed through an unvalidated path.
    return new Promise<Json>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let ended = false;
      const finishError = (error: ExecutionError) => {
        if (ended) return;
        ended = true;
        reject(error);
      };
      const req = request(
        url,
        {
          method,
          agent: false,
          family: 4,
          rejectUnauthorized: true,
          lookup: (_hostname, _options, callback) =>
            callback(null, addresses[0], 4),
          signal: context.signal,
          timeout: spec.timeoutMs ?? 30000,
          headers: {
            Accept: 'application/json',
            ...(write ? { 'Content-Type': 'application/json' } : {}),
            'Idempotency-Key': context.operationKey,
          },
        },
        (response) => {
          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            response.destroy();
            finishError(
              new ExecutionError(
                'HTTP_STATUS',
                !write && (response.statusCode ?? 500) >= 500,
                write,
              ),
            );
            return;
          }
          if (
            !(response.headers['content-type'] ?? '')
              .toLowerCase()
              .includes('application/json')
          ) {
            response.destroy();
            finishError(new ExecutionError('HTTP_CONTENT_TYPE', false, write));
            return;
          }
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1048576) {
              req.destroy();
              finishError(
                new ExecutionError('HTTP_RESPONSE_LIMIT', false, write),
              );
            } else chunks.push(Buffer.from(chunk));
          });
          response.on('error', () =>
            finishError(
              new ExecutionError('HTTP_RESPONSE_LOST', !write, write),
            ),
          );
          response.on('aborted', () =>
            finishError(
              new ExecutionError('HTTP_RESPONSE_LOST', !write, write),
            ),
          );
          response.on('end', () => {
            if (ended) return;
            try {
              const output: unknown = JSON.parse(
                Buffer.concat(chunks).toString('utf8'),
              );
              assertJson(output, 1048576);
              ended = true;
              resolve(output);
            } catch {
              finishError(
                new ExecutionError('HTTP_INVALID_OUTPUT', false, write),
              );
            }
          });
        },
      );
      req.on('timeout', () => req.destroy());
      req.on('error', () =>
        finishError(new ExecutionError('HTTP_TRANSPORT_LOST', !write, write)),
      );
      if (write) req.end(JSON.stringify(inputs));
      else req.end();
    });
  }
}
