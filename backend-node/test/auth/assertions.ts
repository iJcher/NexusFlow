import assert from 'node:assert/strict';

// Shared by the normal acceptance test and the deliberately broken subprocess.
export function assertSingleUse(statuses: number[]): void {
  assert.equal(
    statuses.filter((status) => status === 200).length,
    1,
    'Challenge must succeed exactly once',
  );
}
