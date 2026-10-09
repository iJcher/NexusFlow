import { createServer, connect, Server, Socket } from 'node:net';

// Disrupts only sockets owned by this fixture. Neither service nor any other
// acceptance runner's connections are stopped; this is a transport fault.
export class TransportGate {
  private readonly sockets = new Set<Socket>();
  private server?: Server;
  private blocked = false;
  port = 0;
  rejected = 0;
  broken = 0;
  constructor(readonly upstreamPort: 15432 | 16380) {}
  async start(): Promise<void> {
    this.server = createServer((incoming) => {
      incoming.on('error', () => undefined);
      if (this.blocked) {
        this.rejected++;
        incoming.destroy();
        return;
      }
      const upstream = connect(this.upstreamPort, '127.0.0.1');
      this.sockets.add(incoming);
      this.sockets.add(upstream);
      upstream.on('error', () => incoming.destroy());
      incoming.on('close', () => {
        this.sockets.delete(incoming);
        upstream.destroy();
      });
      upstream.on('close', () => {
        this.sockets.delete(upstream);
        incoming.destroy();
      });
      incoming.pipe(upstream);
      upstream.pipe(incoming);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(0, '127.0.0.1', resolve);
    });
    const address = this.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected loopback TCP fixture address');
    this.port = address.port;
  }
  cut(): void {
    this.blocked = true;
    this.broken += this.sockets.size;
    for (const socket of this.sockets) socket.destroy();
  }
  restore(): void {
    this.blocked = false;
  }
  async close(): Promise<void> {
    this.cut();
    if (this.server)
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
  }
}
