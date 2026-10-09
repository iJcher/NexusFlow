import { resolve4 } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

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

export function publicIPv4(address: string): boolean {
  return isIP(address) === 4 && !blocked.check(address, 'ipv4');
}

export async function resolveApprovedTarget(
  raw: string,
  hosts = process.env.OUTBOUND_ALLOWED_HOSTS ?? '',
  signal?: AbortSignal | null,
) {
  if (signal?.aborted) throw new Error('OUTBOUND_ABORTED');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('OUTBOUND_POLICY');
  }
  const allowed = hosts
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    isIP(url.hostname) ||
    !/^[a-z0-9.-]{1,253}$/.test(url.hostname) ||
    !allowed.includes(url.hostname) ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443')
  )
    throw new Error('OUTBOUND_POLICY');
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const addresses = await Promise.race([
    resolve4(url.hostname),
    new Promise<never>((_resolve, reject) => {
      abort = () => reject(new Error('OUTBOUND_ABORTED'));
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => reject(new Error('OUTBOUND_DNS_TIMEOUT')), 5000);
      timer.unref();
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
  });
  if (!addresses.length || addresses.some((address) => !publicIPv4(address)))
    throw new Error('OUTBOUND_POLICY');
  return { url, address: addresses[0] };
}
