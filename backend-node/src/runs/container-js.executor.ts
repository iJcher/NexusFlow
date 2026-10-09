import { execFile, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { Injectable } from '@nestjs/common';
import {
  ExecutionContext,
  ExecutionError,
  Json,
  JsonObject,
  NodeSpec,
  assertJson,
} from './contracts';

// This wrapper is trusted; submitted code is evaluated ONLY inside the container.
// Container isolation, not eval/node:vm, is the security boundary.
const runner = [
  '"use strict";',
  'let body = "";',
  'process.stdin.setEncoding("utf8");',
  'process.stdin.on("data", chunk => { body += chunk; if(Buffer.byteLength(body)>65536) process.exit(65); });',
  'process.stdin.on("end", async () => {',
  'try {',
  'const request = JSON.parse(body);',
  'const fn = eval("(async function(inputs) {\\n" + request.code + "\\n})");',
  'const output = await fn(request.inputs);',
  'const encoded = JSON.stringify(output);',
  'if(typeof encoded !== "string" || Buffer.byteLength(encoded)>65536) process.exit(66);',
  'process.stdout.write(encoded);',
  '} catch { process.exitCode = 67; }',
  '});',
].join('\n');

@Injectable()
export class ContainerJsExecutor {
  private active = 0;
  private cliEnvironment(): NodeJS.ProcessEnv {
    // Only the trusted host CLI needs these. None are passed with docker --env.
    return {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      USERPROFILE: process.env.USERPROFILE,
      APPDATA: process.env.APPDATA,
      HOME: process.env.HOME,
    };
  }
  private remove(name: string): Promise<void> {
    if (!/^nf-js-[0-9a-f-]{36}$/.test(name))
      throw new Error('Invalid isolated container identity');
    return new Promise((resolve) => {
      execFile(
        'docker',
        ['rm', '-f', name],
        {
          windowsHide: true,
          timeout: 3000,
          maxBuffer: 4096,
          env: this.cliEnvironment(),
        },
        () => resolve(),
      );
    });
  }
  async execute(
    spec: NodeSpec,
    inputs: JsonObject,
    context: ExecutionContext,
  ): Promise<Json> {
    if (process.env.WORKFLOW_JS_ENABLED !== 'true')
      throw new ExecutionError('JS_ISOLATION_DISABLED');
    const image = process.env.WORKFLOW_JS_IMAGE;
    if (!image || !/^node@sha256:[a-f0-9]{64}$/.test(image))
      throw new ExecutionError('JS_ISOLATION_UNAVAILABLE');
    const code = spec.config?.code;
    if (
      typeof code !== 'string' ||
      !code.length ||
      Buffer.byteLength(code) > 16384
    )
      throw new ExecutionError('JS_CODE_LIMIT');
    assertJson(inputs, 65536);
    const payload = JSON.stringify({ code, inputs });
    if (Buffer.byteLength(payload) > 65536)
      throw new ExecutionError('JS_INPUT_LIMIT');
    if (context.signal.aborted) throw new ExecutionError('JS_ABORTED');
    if (this.active >= 2) throw new ExecutionError('JS_CAPACITY', true);
    this.active++;
    const name = 'nf-js-' + randomUUID();
    const timeoutMs = Math.min(spec.timeoutMs ?? 5000, 5000);
    try {
      return await new Promise<Json>((resolve, reject) => {
        const child = spawn(
          'docker',
          [
            'run',
            '--rm',
            '--pull=never',
            '--name',
            name,
            '--label',
            'nexusflow.js-executor=true',
            '--network=none',
            '--read-only',
            '--user=65532:65532',
            '--cap-drop=ALL',
            '--security-opt=no-new-privileges',
            '--cgroupns=private',
            '--ipc=private',
            '--memory=128m',
            '--memory-swap=128m',
            '--cpus=0.5',
            '--pids-limit=32',
            '--ulimit=nofile=64:64',
            '--log-driver=none',
            '--entrypoint=node',
            '-i',
            image,
            '--max-old-space-size=64',
            '-e',
            runner,
          ],
          {
            windowsHide: true,
            shell: false,
            env: this.cliEnvironment(),
            stdio: ['pipe', 'pipe', 'pipe'],
          },
        );
        let output = '';
        const decoder = new StringDecoder('utf8');
        let outputBytes = 0;
        let stderrBytes = 0;
        let failure: ExecutionError | undefined;
        let settled = false;
        const abort = (code: string) => {
          if (failure || settled) return;
          failure = new ExecutionError(code);
          // Kill ONLY the exact random container owned by this invocation.
          void this.remove(name);
          child.kill();
        };
        const onAbort = () => abort('JS_ABORTED');
        context.signal.addEventListener('abort', onAbort, { once: true });
        const timer = setTimeout(() => abort('JS_TIMEOUT'), timeoutMs);
        child.stdout.on('data', (chunk: Buffer) => {
          outputBytes += chunk.length;
          if (outputBytes > 65536) abort('JS_OUTPUT_LIMIT');
          else output += decoder.write(chunk);
        });
        child.stderr.on('data', (chunk: Buffer) => {
          stderrBytes += chunk.length;
          if (stderrBytes > 65536) abort('JS_OUTPUT_LIMIT');
          // Never surface code, inputs, container output or daemon credentials.
        });
        child.stdin.on('error', () => {
          // A failed container may close stdin before all input is delivered.
        });
        child.on('error', () => {
          failure ??= new ExecutionError('JS_ISOLATION_UNAVAILABLE');
        });
        child.on('close', (exitCode) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          context.signal.removeEventListener('abort', onAbort);
          void (async () => {
            await this.remove(name);
            if (failure) {
              reject(failure);
              return;
            }
            if (exitCode !== 0) {
              reject(
                new ExecutionError(
                  exitCode === 66 ? 'JS_OUTPUT_LIMIT' : 'JS_EXECUTION_FAILED',
                ),
              );
              return;
            }
            try {
              output += decoder.end();
              const value: unknown = JSON.parse(output);
              assertJson(value, 65536);
              resolve(value);
            } catch {
              reject(new ExecutionError('JS_INVALID_OUTPUT'));
            }
          })();
        });
        child.stdin.end(payload);
        if (context.signal.aborted) onAbort();
      });
    } finally {
      this.active--;
    }
  }
}
