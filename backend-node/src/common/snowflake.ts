let sequence = 0n;
let lastTimestamp = -1n;
const EPOCH = 1740000000000n;
const WORKER_ID = 1n;

export function nextId(): bigint {
  let timestamp = BigInt(Date.now());
  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & 1023n;
    if (sequence === 0n) {
      while (timestamp <= lastTimestamp) {
        timestamp = BigInt(Date.now());
      }
    }
  } else {
    sequence = 0n;
  }
  lastTimestamp = timestamp;
  // 13位左移 + 10位序列号 = 最大约 2^53，在 JS Number.MAX_SAFE_INTEGER 范围内
  return ((timestamp - EPOCH) << 13n) | (WORKER_ID << 10n) | sequence;
}
