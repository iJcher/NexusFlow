import { createHash } from "node:crypto";
import { writeFile, mkdir, readFile, lstat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { redact } from "../../support/redaction.js";

// This is intentionally not a Mailpit test. It never reads a server OTP from DB/API.
// Start a separate API with real SMTP configured outside this script, then authorize
// one exact recipient. No live secrets are accepted as CLI arguments or reported.
async function hiddenInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error(
      "Live manual inbox verification requires an interactive terminal",
    );
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const reader = createInterface({
    input: process.stdin,
    output: sink,
    terminal: true,
  });
  process.stdout.write(`${prompt}（不会回显或保存），按 Enter：\n`);
  return new Promise((resolveCode, reject) => {
    const timeout = setTimeout(() => {
      reader.close();
      reject(new Error("Inbox verification timed out"));
    }, 300_000);
    reader.question("", (answer) => {
      clearTimeout(timeout);
      reader.close();
      resolveCode(answer.trim());
    });
  });
}

export function apiData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid API envelope");
  const response = value as Record<string, unknown>;
  if (
    response.errCode !== 0 ||
    !response.data ||
    typeof response.data !== "object" ||
    Array.isArray(response.data)
  )
    throw new Error("Invalid API envelope");
  return response.data as Record<string, unknown>;
}

export function validatePending(
  value: unknown,
  email: string,
  apiBase: string,
  origin: string,
  now = Date.now(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid pending evidence");
  const pending = value as Record<string, unknown>;
  const sent =
    typeof pending.sentAt === "string" ? Date.parse(pending.sentAt) : NaN;
  if (
    pending.caseId !== "P00-AUTH-LIVE" ||
    pending.status !== "PENDING" ||
    pending.recipientHash !==
      createHash("sha256").update(email).digest("hex") ||
    pending.apiBase !== apiBase ||
    pending.origin !== origin ||
    typeof pending.challengeId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      pending.challengeId,
    ) ||
    !Number.isFinite(sent) ||
    now < sent ||
    now - sent > 300_000
  )
    throw new Error(
      "Pending evidence mismatched or expired; do not silently resend",
    );
  return { challengeId: pending.challengeId, sentAt: pending.sentAt as string };
}

export async function run(
  mode: "interactive" | "send-only" | "complete" = "interactive",
) {
  const email = process.env.LIVE_TEST_EMAIL?.trim();
  const allowed = process.env.LIVE_EMAIL_ALLOWED_RECIPIENT?.trim();
  const base = process.env.LIVE_API_URL;
  const origin = process.env.LIVE_ORIGIN;
  if (
    !email ||
    !allowed ||
    email !== allowed ||
    !base ||
    !origin ||
    process.env.LIVE_INTEGRATION !== "1"
  ) {
    console.log(
      "BLOCKED: provide LIVE_INTEGRATION=1, exact recipient allowlist, LIVE_API_URL and LIVE_ORIGIN. No email was sent.",
    );
    process.exitCode = 2;
    return;
  }
  const endpoint = new URL(base);
  const apiUrl = (path: string) =>
    new URL(`${endpoint.href.replace(/\/$/, "")}/${path.replace(/^\//, "")}`);
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    throw new Error("Live URL must not contain credentials, query or fragment");
  if (
    endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(endpoint.hostname)
    )
  ) {
    throw new Error(
      "Live API must use HTTPS or explicitly started local loopback",
    );
  }
  if (new URL(origin).origin !== origin)
    throw new Error("LIVE_ORIGIN must be an exact configured origin");
  if (!process.stdin.isTTY && mode !== "send-only") {
    console.log(
      "BLOCKED: manual real inbox evidence needs interactive stdin; no email was sent.",
    );
    process.exitCode = 2;
    return;
  }
  if (!process.env.P00_ARTIFACT_DIR)
    throw new Error("P00_ARTIFACT_DIR is required for live evidence");
  const directory = resolve(process.env.P00_ARTIFACT_DIR);
  const pendingFile = resolve(directory, "pending-email.json");
  let challengeId: string;
  let sentAt: string;
  if (mode === "complete") {
    const pending = validatePending(
      JSON.parse(await readFile(pendingFile, "utf8")),
      email,
      endpoint.href,
      origin,
    );
    challengeId = pending.challengeId;
    sentAt = pending.sentAt;
  } else {
    if (mode === "send-only") {
      try {
        await lstat(pendingFile);
        throw new Error("Pending evidence already exists; do not resend");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    sentAt = new Date().toISOString();
    if (mode === "send-only") {
      await mkdir(directory, { recursive: true });
      // Exclusive, persistent intent closes the preflight/send race. Even after
      // a crash or unknown response this attempt cannot silently send twice.
      await writeFile(
        resolve(directory, "send-intent.json"),
        JSON.stringify(
          {
            caseId: "P00-AUTH-LIVE",
            status: "ATTEMPT_INTENT",
            sentAt,
            recipientHash: createHash("sha256").update(email).digest("hex"),
            apiBase: endpoint.href,
            origin,
          },
          null,
          2,
        ),
        { encoding: "utf8", flag: "wx" },
      );
    }
    const requestCode = await fetch(apiUrl("/auth/email/code"), {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!requestCode.ok)
      throw new Error(
        `Real SMTP request did not succeed: HTTP ${requestCode.status}`,
      );
    const challenge = apiData(await requestCode.json());
    if (
      typeof challenge.challengeId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        challenge.challengeId,
      )
    )
      throw new Error("Missing challenge identifier");
    challengeId = challenge.challengeId;
    if (mode === "send-only") {
      await mkdir(directory, { recursive: true });
      await writeFile(
        pendingFile,
        JSON.stringify(
          {
            caseId: "P00-AUTH-LIVE",
            status: "PENDING",
            recipientHash: createHash("sha256").update(email).digest("hex"),
            challengeId,
            sentAt,
            apiBase: endpoint.href,
            origin,
            note: "SMTP accepted only. Real inbox/login not verified.",
          },
          null,
          2,
        ),
        { encoding: "utf8", flag: "wx" },
      );
      console.log(
        "P00-AUTH-LIVE PENDING: one code email accepted; inbox and login require local terminal completion. No OTP retained.",
      );
      process.exitCode = 2;
      return;
    }
  }
  const code = await hiddenInput("从授权真实收件箱读取验证码后输入");
  if (!/^\d{6}$/.test(code))
    throw new Error("A six-digit code from the actual inbox is required");
  const receivedAt = new Date().toISOString();
  const messageId = await hiddenInput(
    "从该邮件原始邮件头读取实际 Message-ID 后输入",
  );
  if (
    !messageId ||
    messageId === "not-provided" ||
    /[\r\n\0]/.test(messageId) ||
    messageId.length > 998
  ) {
    console.log(
      "BLOCKED: actual received email Message-ID evidence is required; no login was performed.",
    );
    process.exitCode = 2;
    return;
  }
  const login = await fetch(apiUrl("/auth/email/login"), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, challengeId, code }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!login.ok)
    throw new Error(`Real inbox code was rejected: HTTP ${login.status}`);
  let session: {
    accessToken?: string;
    user?: { id?: string; email?: string };
  };
  const cookie = login.headers.get("set-cookie");
  if (!cookie)
    throw new Error(
      "Live refresh cookie missing; test session cleanup unavailable",
    );
  try {
    session = apiData(await login.json());
    if (
      typeof session.accessToken !== "string" ||
      !session.accessToken ||
      typeof session.user?.id !== "string" ||
      !session.user.id ||
      session.user.email !== email
    )
      throw new Error(
        "Successful login did not establish the authorized identity",
      );
    if (!cookie.includes("HttpOnly"))
      throw new Error("Live refresh cookie must be HttpOnly");
    if (endpoint.protocol === "https:" && !cookie.includes("Secure"))
      throw new Error("HTTPS live refresh cookie must be Secure");
    const whoami = await fetch(apiUrl("/UserAccount/GetCurrentUser"), {
      headers: { authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!whoami.ok)
      throw new Error(
        `Authenticated live endpoint denied the new session: HTTP ${whoami.status}`,
      );
    const identity = apiData(await whoami.json());
    if (identity.UserId !== session.user.id || identity.Email !== email)
      throw new Error("Authenticated identity mismatch");
  } finally {
    const logout = await fetch(apiUrl("/auth/logout"), {
      method: "POST",
      headers: { origin, cookie: cookie.split(";")[0] },
      signal: AbortSignal.timeout(15_000),
    });
    if (!logout.ok)
      throw new Error(`Live test session logout failed: HTTP ${logout.status}`);
  }
  const revoked = await fetch(apiUrl("/UserAccount/GetCurrentUser"), {
    headers: { authorization: `Bearer ${session.accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (revoked.status !== 401)
    throw new Error("Logged-out access token was not revoked");
  const evidence = {
    caseId: "P00-AUTH-LIVE",
    status: "PASS",
    mode: "manual-real-inbox-plus-automated-login",
    recipientHash: createHash("sha256").update(email).digest("hex"),
    sentAt,
    receivedAt,
    authenticatedAt: new Date().toISOString(),
    loggedOut: true,
    messageIdSha256: createHash("sha256").update(messageId).digest("hex"),
    note: "Inbox receipt has a manual step; code/token/cookie are not retained. This is not an automated inbox-reader claim.",
  };
  const report = process.env.P00_ARTIFACT_DIR
    ? resolve(process.env.P00_ARTIFACT_DIR, "live-email.json")
    : undefined;
  if (report) {
    await mkdir(dirname(report), { recursive: true });
    await writeFile(report, JSON.stringify(evidence, null, 2), "utf8");
  }
  console.log(
    "P00-AUTH-LIVE PASS: real inbox code authenticated; test session revoked. Evidence contains no code/token.",
  );
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const mode =
    args.length === 0
      ? "interactive"
      : args.length === 1 && args[0] === "--send-only"
        ? "send-only"
        : args.length === 1 && args[0] === "--complete"
          ? "complete"
          : null;
  if (!mode) {
    console.error("Usage: live-email-smoke.ts [--send-only|--complete]");
    process.exitCode = 1;
  } else
    void run(mode).catch(() => {
      console.error(
        "P00_AUTH_LIVE_FAILED: inspect local configuration/HTTP status without publishing credentials",
      );
      process.exitCode = 1;
    });
}
