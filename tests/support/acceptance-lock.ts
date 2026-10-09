import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

export class AcceptanceWorkspaceBusy extends Error {
  constructor() {
    super(
      "ACCEPTANCE_WORKSPACE_BUSY: another stage owns this checkout; serialize stage verification. If its process crashed, verify all stage children exited before removing artifacts/acceptance/.workspace.lock.",
    );
  }
}

/** Prisma's native DLL and build output belong to the checkout, not to a stage. */
export async function withAcceptanceLock<T>(
  root: string,
  action: () => Promise<T>,
): Promise<T> {
  const directory = join(resolve(root), "artifacts", "acceptance");
  await mkdir(directory, { recursive: true });
  const path = join(directory, ".workspace.lock");
  const identity = JSON.stringify({ pid: process.pid, token: randomUUID() });
  const handle = await open(path, "wx", 0o600).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "EEXIST") throw new AcceptanceWorkspaceBusy();
      throw error;
    },
  );
  try {
    await handle.writeFile(identity, "utf8");
    return await action();
  } finally {
    await handle.close();
    // Never remove a lock that has been replaced by another owner/operator.
    if ((await readFile(path, "utf8")) !== identity)
      throw new Error("ACCEPTANCE_LOCK_OWNERSHIP_CHANGED");
    await unlink(path);
  }
}
