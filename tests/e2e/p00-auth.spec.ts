import { randomBytes } from "node:crypto";
import { test, expect } from "@playwright/test";
import { acceptanceEnvironment } from "../support/environment";

// Auth steps never produce trace/HAR/video/screenshots; OTP and tokens remain in memory.
test.use({ trace: "off", video: "off", screenshot: "off" });

async function deliveredCode(email: string): Promise<string> {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const response = await fetch(
      `${acceptanceEnvironment.P00_MAILPIT_URL}/api/v1/messages?limit=200`,
    );
    if (!response.ok) throw new Error("Mailpit integration unavailable");
    const data = (await response.json()) as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const summary = data.messages.find((item) =>
      item.To.some((recipient) => recipient.Address === email),
    );
    if (summary) {
      const detailResponse = await fetch(
        `${acceptanceEnvironment.P00_MAILPIT_URL}/api/v1/message/${summary.ID}`,
      );
      if (!detailResponse.ok)
        throw new Error("Delivered message could not be inspected");
      const detail = (await detailResponse.json()) as {
        Text?: string;
        HTML?: string;
      };
      const result = `${detail.Text ?? ""} ${detail.HTML ?? ""}`.match(
        /\b\d{6}\b/,
      )?.[0];
      if (!result)
        throw new Error("Email did not contain a six-digit verification code");
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Real SMTP message was not delivered to the local test mailbox",
  );
}

test("P00-AUTH-02 invalid email/code are blocked by the actual login page, not just API DTOs", async ({
  page,
}) => {
  let sends = 0;
  let logins = 0;
  page.on("request", (event) => {
    if (event.method() !== "POST") return;
    if (event.url().endsWith("/auth/email/code")) sends++;
    if (event.url().endsWith("/auth/email/login")) logins++;
  });
  await page.goto("/login");
  const email = page.getByLabel("邮箱", { exact: true });
  const send = page.getByRole("button", { name: /发送验证码/ });
  const submit = page.getByRole("button", { name: /^(登录|登 录)$/ });
  await submit.click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await email.fill("not-an-email");
  if (await send.isEnabled()) await send.click();
  await email.blur();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(sends).toBe(0);
  expect(logins).toBe(0);
  await email.fill("valid+nexus@nexus.test");
  await page.getByLabel("验证码", { exact: true }).fill("12");
  await submit.click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  expect(logins).toBe(0);
});

test("P00-AUTH-01 browser → real backend SMTP → mailbox OTP → protected page → refresh session", async ({
  page,
  context,
}, testInfo) => {
  // Store only error classifications and URL pathnames, never request bodies,
  // headers, query strings, browser storage, or raw console/error messages.
  const diagnostics: { kind: string; pathname?: string; status?: number; category?: string }[] = [];
  const classify = (message: string) =>
    /dynamically imported module|module script/i.test(message) ? "module-load"
      : /does not provide an export|requested module/i.test(message) ? "module-export"
        : /ReferenceError|is not defined/i.test(message) ? "reference-error"
          : /TypeError/i.test(message) ? "type-error" : "other-error";
  page.on("pageerror", error => {
    diagnostics.push({ kind: "pageerror", category: classify(`${error.name} ${error.message}`) });
  });
  page.on("console", message => {
    if (message.type() === "error")
      diagnostics.push({ kind: "console-error", category: classify(message.text()) });
  });
  page.on("requestfailed", request => {
    diagnostics.push({ kind: "requestfailed", pathname: new URL(request.url()).pathname });
  });
  page.on("response", response => {
    if (response.status() >= 400)
      diagnostics.push({ kind: "http-error", pathname: new URL(response.url()).pathname, status: response.status() });
  });
  const email = `p00-ui-${randomBytes(8).toString("hex")}+tag@nexus.test`;
  await page.goto("/login");
  await page.getByLabel("邮箱", { exact: true }).fill(email);
  const issuedPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/email/code") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /发送验证码/ }).click();
  const issued = await issuedPromise;
  expect(issued.status()).toBe(202);
  const data = await issued.json();
  expect(Object.keys(data.data).sort()).toEqual([
    "challengeId",
    "expiresAt",
    "retryAfter",
  ]);
  const code = await deliveredCode(email);
  await page.getByLabel("验证码", { exact: true }).fill(code);
  const loginPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/email/login") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^(登录|登 录)$/ }).click();
  const signedIn = await loginPromise;
  expect(signedIn.status()).toBe(200);
  const identity = await signedIn.json();
  expect(identity.data.user.email).toBe(email);
  expect("refreshToken" in identity.data).toBe(false);
  try {
    await expect(page).toHaveURL(/\/studio(?:\?|$)/);
  } catch (error) {
    const state = await page.evaluate(async () => {
      const modulePath = '/src/stores/auth.ts';
      const module = await import(modulePath);
      const store = module.useAuthStore();
      return { authenticated: store.getIsAuthenticated, initialized: store.initialized,
        sessionGeneration: store.sessionGeneration,
        hasSession: Boolean(store.tokenInfo), hasErrorBanner: Boolean(document.querySelector('.form__error-banner')) };
    }).catch(() => ({ stateInspectionUnavailable: true }));
    await testInfo.attach("sanitized-auth-navigation-diagnostics", {
      body: JSON.stringify({ diagnostics, state }), contentType: "application/json",
    });
    console.log("Sanitized auth navigation diagnostics:", JSON.stringify({ diagnostics, state }));
    throw error;
  }
  const me = await page.request.get("/api/auth/me", {
    headers: { Authorization: `Bearer ${identity.data.accessToken}` },
  });
  expect(me.status()).toBe(200);
  const cookies = await context.cookies();
  const cookie = cookies.find((item) => item.name === "nf_refresh");
  expect(Boolean(cookie?.httpOnly)).toBe(true);
  expect(cookie?.path).toBe("/api/auth");
  const persistedSensitive = await page.evaluate(
    ({ secretCode, accessToken }) => {
      const values = [
        ...Object.values(localStorage),
        ...Object.values(sessionStorage),
      ];
      return values.some(
        (item) => item === secretCode || item.includes(accessToken),
      );
    },
    { secretCode: code, accessToken: identity.data.accessToken },
  );
  expect(persistedSensitive).toBe(false);
  const refreshPromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/auth/refresh") &&
      response.request().method() === "POST",
  );
  await page.reload();
  expect((await refreshPromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/studio(?:\?|$)/);
});

test("P00-AUTH-13 email change clears the previous challenge/code and a reload does not bypass cooldown", async ({
  page,
}) => {
  const email = `p00-ui-change-${randomBytes(8).toString("hex")}@nexus.test`;
  await page.goto("/login");
  const emailInput = page.getByLabel("邮箱", { exact: true });
  const codeInput = page.getByLabel("验证码", { exact: true });
  await emailInput.fill(email);
  const issuedPromise = page.waitForResponse((response) =>
    response.url().endsWith("/auth/email/code"),
  );
  await page.getByRole("button", { name: /发送验证码/ }).click();
  expect((await issuedPromise).status()).toBe(202);
  await codeInput.fill(await deliveredCode(email));
  await emailInput.fill(`changed-${email}`);
  await expect(codeInput).toHaveValue("");
  await page.reload();
  await emailInput.fill(email);
  const deniedPromise = page.waitForResponse((response) =>
    response.url().endsWith("/auth/email/code"),
  );
  await page.getByRole("button", { name: /发送验证码/ }).click();
  expect((await deniedPromise).status()).toBe(429);
});
