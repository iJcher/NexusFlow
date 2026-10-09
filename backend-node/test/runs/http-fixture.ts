import { createServer, Server } from 'node:http';
import { AddressInfo, Socket } from 'node:net';

export interface AcceptedRequest {
  method: string;
  key: string | undefined;
  body: unknown;
  path: string;
}
export class HttpAcceptanceFixture {
  readonly accepted: AcceptedRequest[] = [];
  private readonly sockets = new Set<Socket>();
  private readonly releaseResponse = new Map<string, () => void>();
  private server: Server;
  private holding = true;
  url = '';
  constructor() {
    this.server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        let body: unknown = null;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null');
        } catch {
          response.writeHead(400).end();
          return;
        }
        const requestPath = request.url || '/';
        const rawKey = request.headers['idempotency-key'];
        const key = typeof rawKey === 'string' ? rawKey : undefined;
        this.accepted.push({
          method: request.method || '',
          key,
          body,
          path: requestPath,
        });
        const answer = () => {
          response.writeHead(200, { 'Content-Type': 'application/json' });
          response.end(JSON.stringify({ accepted: true, item: body }));
        };
        if (requestPath.startsWith('/accept-and-drop')) {
          // Remote side effect has happened; response is genuinely lost on the TCP socket.
          request.socket.destroy();
        } else if (
          (requestPath.startsWith('/hold-after-first')
            ? this.accepted.length > 1
            : requestPath.startsWith('/hold')) &&
          this.holding
        ) {
          this.releaseResponse.set(key || String(this.accepted.length), answer);
        } else answer();
      });
    });
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
  }
  async start(): Promise<void> {
    await new Promise<void>((resolveListen) =>
      this.server.listen(0, '127.0.0.1', resolveListen),
    );
    this.url =
      'http://127.0.0.1:' + (this.server.address() as AddressInfo).port;
  }
  release(key: string): void {
    this.releaseResponse.get(key)?.();
    this.releaseResponse.delete(key);
  }
  releaseAll(): void {
    this.holding = false;
    for (const answer of this.releaseResponse.values()) answer();
    this.releaseResponse.clear();
  }
  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((resolveClose, reject) =>
      this.server.close((error) => (error ? reject(error) : resolveClose())),
    );
  }
}
