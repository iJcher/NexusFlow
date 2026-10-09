import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import {
  acceptanceEnvironment,
  assertIsolatedEnvironment,
} from "../../support/environment.js";
import {
  withAcceptanceLock,
  AcceptanceWorkspaceBusy,
} from "../../support/acceptance-lock.js";

type Status = "PASS" | "FAIL" | "BLOCKED";
type Step = {
  name: string;
  status: Status;
  exitCode: number | null;
  timedOut: boolean;
  startedAt: string;
  finishedAt: string;
};
type Source = { path: string; sha256: string };
type Case = { name: string; status: string };
type JestSuite = { name?: unknown; assertionResults?: unknown };
const root = resolve(__dirname, "../../..");
const runId =
  new Date().toISOString().replace(/[:.]/g, "-") +
  "-" +
  randomBytes(4).toString("hex");
const directory = join(root, "artifacts/acceptance/P01", runId);
const requiredSuites = [
  "tenant-regressions.spec.ts",
  "legacy-boundaries.spec.ts",
  "chunking-boundaries.spec.ts",
  "p01-secrets.spec.ts",
  "p01-outbound.spec.ts",
];
const missingCaseIDs = [
  "P01-01",
  "P01-02",
  "P01-03",
  "P01-04",
  "P01-05",
  "P01-06",
  "P01-07",
];
const env: NodeJS.ProcessEnv = { ...acceptanceEnvironment };
for (const name of [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "COMSPEC",
  "TEMP",
  "TMP",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "HOME",
  "PNPM_HOME",
  // Docker discovers Windows CLI plugins under these installation roots.
  "ProgramFiles",
  "ProgramW6432",
]) {
  if (process.env[name]) env[name] = process.env[name];
}
const steps: Step[] = [];
const gaps: string[] = [];
let temporary = "";
let startSources: Source[] = [];
let suiteStatus: Status = "BLOCKED";
let workspaceStatus: Status = "BLOCKED";
let workspaceCounts: Record<string, number> = {};
let evidenceFailure = false;
let counts: Record<string, number> = {};
let cases: Case[] = [];
let versions: Record<string, string> = { node: process.version };

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function git(args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error("GIT_EVIDENCE_UNAVAILABLE");
  return result.stdout.trim();
}
async function sources(): Promise<Source[]> {
  const paths = git([
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ])
    .split("\0")
    .filter(Boolean);
  const result: Source[] = [];
  for (const path of [...new Set(paths)].sort()) {
    if (
      /(^|\/)(node_modules|artifacts|dist|coverage|\.git|fonts|secrets|credentials)(\/|$)/i.test(
        path,
      ) ||
      /(^|\/)\.env/i.test(path) ||
      !/\.(ts|tsx|js|cjs|mjs|json|vue|sql|md|ya?ml|html|css|scss|ps1|sh|toml)$|(^|\/)Dockerfile$|(^|\/)\.gitignore$/i.test(
        path,
      )
    )
      continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(root + sep)) throw new Error("SOURCE_PATH_ESCAPE");
    try {
      const stat = await lstat(absolute);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2_000_000)
        result.push({
          path,
          sha256: createHash("sha256")
            .update(await readFile(absolute))
            .digest("hex"),
        });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return result;
}
async function command(
  name: string,
  executable: string,
  args: string[],
  infrastructure = false,
  timeout = 180_000,
) {
  const startedAt = new Date().toISOString();
  let timedOut = false;
  // Child output is deliberately not captured or published. Assertion payloads,
  // SQL error text, URL credentials, and environment values cannot enter reports.
  const exitCode = await new Promise<number | null>((done) => {
    const child = spawn(executable, args, {
      cwd: root,
      env,
      shell: process.platform === "win32",
      windowsHide: true,
      stdio: "ignore",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform === "win32" && child.pid)
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else child.kill("SIGTERM");
    }, timeout);
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done(code);
    });
  });
  const status: Status =
    exitCode === 0 && !timedOut ? "PASS" : infrastructure ? "BLOCKED" : "FAIL";
  steps.push({
    name,
    status,
    exitCode,
    timedOut,
    startedAt,
    finishedAt: new Date().toISOString(),
  });
  console.log(name + ": " + status);
  return status === "PASS";
}
function version(executable: string, args: string[]) {
  const result = spawnSync(executable, args, {
    cwd: root,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.status !== 0) return "UNAVAILABLE";
  // pnpm may print install/update notices before the child tool's output.
  // Accept exactly one standalone version line, never a version in a notice.
  const matches = [
    ...result.stdout.matchAll(
      /^(?:Version\s+|v)?(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?)\s*$/gm,
    ),
  ];
  return matches.length === 1 ? matches[0][1] : "UNAVAILABLE";
}
async function inspectJest() {
  const parsed: unknown = JSON.parse(
    await readFile(join(temporary, "security.json"), "utf8"),
  );
  if (!parsed || typeof parsed !== "object")
    throw new Error("INVALID_JEST_REPORT");
  const report = parsed as Record<string, unknown>;
  for (const field of [
    "numPassedTests",
    "numFailedTests",
    "numPendingTests",
    "numTodoTests",
    "numTotalTests",
    "numTotalTestSuites",
  ]) {
    const value = report[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
      throw new Error("INVALID_JEST_COUNTS");
    counts[field] = value;
  }
  if (!Array.isArray(report.testResults))
    throw new Error("INVALID_JEST_SUITES");
  const seen = new Set<string>();
  for (const item of report.testResults as JestSuite[]) {
    if (typeof item.name !== "string" || !Array.isArray(item.assertionResults))
      throw new Error("INVALID_JEST_CASES");
    const suite = basename(item.name);
    if (!requiredSuites.includes(suite))
      throw new Error("UNEXPECTED_SECURITY_SUITE");
    seen.add(suite);
    for (const [index, test] of item.assertionResults.entries()) {
      if (!test || typeof test !== "object")
        throw new Error("INVALID_JEST_CASE");
      const status = (test as Record<string, unknown>).status;
      if (
        !["passed", "failed", "pending", "todo", "disabled"].includes(
          String(status),
        )
      )
        throw new Error("INVALID_JEST_CASE_STATUS");
      // Parametrized titles can contain fixture secrets. Publish stable structural
      // case names, never raw Jest titles, failure messages, or failureDetails.
      cases.push({
        name: suite + "#case-" + (index + 1),
        status: String(status),
      });
    }
  }
  if (
    requiredSuites.some((suite) => !seen.has(suite)) ||
    seen.size !== requiredSuites.length ||
    counts.numPassedTests < 185 ||
    counts.numFailedTests !== 0 ||
    counts.numPendingTests !== 0 ||
    counts.numTodoTests !== 0 ||
    report.success !== true ||
    cases.length !== counts.numTotalTests ||
    cases.some((test) => test.status !== "passed")
  )
    throw new Error("SECURITY_CONTRACT_NOT_PASSED");
}
async function inspectWorkspaceJest() {
  const report = JSON.parse(
    await readFile(join(temporary, "workspace.json"), "utf8"),
  ) as Record<string, unknown>;
  if (!report || typeof report !== "object")
    throw new Error("INVALID_WORKSPACE_REPORT");
  for (const field of [
    "numPassedTests",
    "numFailedTests",
    "numPendingTests",
    "numTodoTests",
    "numTotalTests",
    "numTotalTestSuites",
  ]) {
    const value = report[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0)
      throw new Error("INVALID_WORKSPACE_COUNTS");
    workspaceCounts[field] = value;
  }
  if (!Array.isArray(report.testResults) || report.testResults.length !== 1)
    throw new Error("INVALID_WORKSPACE_SUITES");
  const suite = report.testResults[0] as JestSuite;
  if (
    typeof suite.name !== "string" ||
    basename(suite.name) !== "workspace.e2e.spec.ts" ||
    !Array.isArray(suite.assertionResults)
  )
    throw new Error("INVALID_WORKSPACE_CASES");
  if (
    suite.assertionResults.some(
      (item: unknown) =>
        !item ||
        typeof item !== "object" ||
        (item as Record<string, unknown>).status !== "passed",
    ) ||
    suite.assertionResults.length !== workspaceCounts.numTotalTests ||
    workspaceCounts.numPassedTests < 68 ||
    workspaceCounts.numTotalTestSuites !== 1 ||
    workspaceCounts.numFailedTests !== 0 ||
    workspaceCounts.numPendingTests !== 0 ||
    workspaceCounts.numTodoTests !== 0 ||
    report.success !== true
  )
    throw new Error("WORKSPACE_CONTRACT_NOT_PASSED");
  cases.push(
    ...suite.assertionResults.map((_item: unknown, index: number) => ({
      name: "workspace.e2e.spec.ts#case-" + (index + 1),
      status: "passed",
    })),
  );
}
async function scanArtifacts(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) {
      await scanArtifacts(file);
      continue;
    }
    const text = await readFile(file, "utf8");
    const sensitive = [
      env.AUTH_JWT_SECRET,
      env.JWT_SECRET,
      env.AUTH_EMAIL_CODE_PEPPER,
      env.CONNECTION_ENCRYPTION_KEYS,
      Buffer.alloc(32, 37).toString("base64"),
      "fixture-provider-key",
      "fixture-env-secret",
      "fixture-header-secret",
      "legacy-provider-key",
      "legacy-env",
      "legacy-header",
      "replacement-key",
      "never-log-this",
      "sk-secret-example",
      "nexus_test_only",
    ].filter((value): value is string => Boolean(value));
    if (
      sensitive.some((secret) => text.includes(secret)) ||
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(text)
    ) {
      await writeFile(file, "EVIDENCE_SUPPRESSED_SENSITIVE_CONTENT", "utf8");
      throw new Error("SENSITIVE_ARTIFACT_DETECTED");
    }
  }
}
async function run() {
  await mkdir(directory, { recursive: true });
  assertIsolatedEnvironment(env);
  startSources = await sources();
  // Prisma CLI may implicitly load .env: inspect metadata only, never read or
  // temporarily overwrite the user's configuration.
  for (const path of [
    ".env",
    "backend-node/.env",
    "backend-node/prisma/.env",
  ]) {
    try {
      await lstat(join(root, path));
      const now = new Date().toISOString();
      steps.push({
        name: "dotenv-isolation",
        status: "BLOCKED",
        exitCode: null,
        timedOut: false,
        startedAt: now,
        finishedAt: now,
      });
      gaps.push("DOTENV_PRESENT_PRISMA_IMPLICIT_CONFIG_LOAD_REFUSED");
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  temporary = await mkdtemp(join(tmpdir(), "nexus-p01-evidence-"));
  versions = {
    node: process.version,
    pnpm: version("pnpm", ["--version"]),
    typescript: version("pnpm", [
      "--dir",
      "backend-node",
      "exec",
      "tsc",
      "--version",
    ]),
  };
  if (Object.values(versions).includes("UNAVAILABLE")) {
    evidenceFailure = true;
    gaps.push("REQUIRED_TOOL_VERSION_UNAVAILABLE");
  }
  await command("runner-regression", "node", [
    "--test",
    "tests/acceptance/P01/runner-regression.test.cjs",
  ]);
  await command("workspace-lock-regression", "node", [
    "--test",
    "tests/support/acceptance-lock.test.cjs",
  ]);
  await command("prisma-generate", "pnpm", [
    "--dir",
    "backend-node",
    "exec",
    "prisma",
    "generate",
  ]);
  await command("backend-typecheck", "pnpm", [
    "--dir",
    "backend-node",
    "exec",
    "tsc",
    "--noEmit",
    "--pretty",
    "false",
  ]);
  await command("backend-build", "pnpm", ["--dir", "backend-node", "build"]);
  await command("backend-readonly-lint", "pnpm", [
    "--dir",
    "backend-node",
    "lint:check",
  ]);
  if (!(await command("docker-ready", "docker", ["info"], true, 30_000)))
    return;
  if (
    !(await command(
      "isolated-postgres",
      "docker",
      [
        "compose",
        "-f",
        "docker-compose.test.yml",
        "up",
        "-d",
        "--wait",
        "postgres",
      ],
      true,
    ))
  )
    return;
  if (
    !(await command("isolated-migration", "pnpm", [
      "--dir",
      "backend-node",
      "exec",
      "prisma",
      "migrate",
      "deploy",
    ]))
  )
    return;
  const executed = await command(
    "security-contract",
    "pnpm",
    [
      "--dir",
      "backend-node",
      "exec",
      "jest",
      "--config",
      "test/jest-security.json",
      "--runInBand",
      "--json",
      "--outputFile=" + join(temporary, "security.json"),
    ],
    false,
    360_000,
  );
  try {
    await inspectJest();
    suiteStatus = executed ? "PASS" : "FAIL";
  } catch {
    suiteStatus = "FAIL";
    gaps.push("SECURITY_REPORT_OR_ASSERTIONS_FAILED");
  }
  const workspaceExecuted = await command("workspace-contract", "pnpm", [
    "--dir",
    "backend-node",
    "exec",
    "jest",
    "--config",
    "test/jest-workspace-e2e.json",
    "--runInBand",
    "--json",
    "--outputFile=" + join(temporary, "workspace.json"),
  ]);
  try {
    await inspectWorkspaceJest();
    workspaceStatus = workspaceExecuted ? "PASS" : "FAIL";
  } catch {
    workspaceStatus = "FAIL";
    gaps.push("WORKSPACE_REPORT_OR_ASSERTIONS_FAILED");
  }
}
async function main() {
  try {
    await run();
  } catch {
    evidenceFailure = true;
    gaps.push("RUNNER_EVIDENCE_OR_ISOLATION_ERROR");
  } finally {
    let endSources: Source[] = [];
    try {
      endSources = await sources();
    } catch {
      evidenceFailure = true;
      gaps.push("END_SOURCE_MANIFEST_UNAVAILABLE");
    }
    const sourceStartSha256 = hash(startSources);
    const sourceEndSha256 = hash(endSources);
    if (!startSources.length || sourceStartSha256 !== sourceEndSha256) {
      evidenceFailure = true;
      gaps.push("SOURCE_CHANGED_OR_UNAVAILABLE_FREEZE_AND_RERUN");
    }
    if (temporary) {
      // Only the exact mkdtemp result is removed, never a user-provided target.
      if (!temporary.startsWith(join(tmpdir(), "nexus-p01-evidence-")))
        throw new Error("TEMP_PATH_ESCAPE");
      await rm(temporary, { recursive: true, force: true });
    }
    const contractStatus: Status =
      evidenceFailure ||
      suiteStatus === "FAIL" ||
      workspaceStatus === "FAIL" ||
      steps.some((step) => step.status === "FAIL")
        ? "FAIL"
        : suiteStatus === "PASS" &&
            workspaceStatus === "PASS" &&
            steps.every((step) => step.status === "PASS")
          ? "PASS"
          : "BLOCKED";
    const overallStatus =
      contractStatus === "PASS" ? "PARTIAL" : contractStatus;
    const report = {
      stage: "P01",
      scope: "CURRENT_SUBCAPABILITIES_ONLY",
      contractVersion: 1,
      runId,
      contractStatus,
      overallStatus,
      completeStageEligible: false,
      revision: git(["rev-parse", "HEAD"]),
      branch: git(["branch", "--show-current"]),
      sourceStartSha256,
      sourceEndSha256,
      sourceManifest: endSources,
      hashScope:
        "Tracked+untracked text; env/secrets/binaries/dependencies/artifacts excluded",
      versions,
      steps,
      counts,
      workspaceCounts,
      cases,
      missingCaseIDs,
      gaps,
      remainingCapabilities: [
        "Complete resource/API role matrix and connection use authorization",
        "Invitation email delivery and historical workspace/resource migration",
        "Real TLS and network-egress enforcement acceptance",
        "Legacy graph migration and compatible immutable publication",
        "Full JWT/JS API bypass contract coverage",
      ],
      finishedAt: new Date().toISOString(),
    };
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "report.json"),
      JSON.stringify(report, null, 2),
      "utf8",
    );
    await writeFile(
      join(directory, "gate.xml"),
      '<testsuite name="P01-current-contract" tests="1" failures="' +
        (contractStatus === "PASS" ? "0" : "1") +
        '"><testcase name="P01-current-contract">' +
        (contractStatus === "PASS"
          ? ""
          : '<failure message="' + contractStatus + '"/>') +
        "</testcase></testsuite>",
      "utf8",
    );
    try {
      await scanArtifacts(directory);
    } catch {
      await writeFile(
        join(directory, "report.json"),
        JSON.stringify(
          {
            stage: "P01",
            contractStatus: "FAIL",
            overallStatus: "FAIL",
            completeStageEligible: false,
            gaps: ["SENSITIVE_ARTIFACT_DETECTED"],
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        join(directory, "gate.xml"),
        '<testsuite name="P01-current-contract" tests="1" failures="1"><testcase name="P01-current-contract"><failure message="SENSITIVE_ARTIFACT_DETECTED"/></testcase></testsuite>',
        "utf8",
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      "P01 contract=" +
        contractStatus +
        " overall=" +
        overallStatus +
        "; report=" +
        join(directory, "report.json"),
    );
    // PARTIAL is deliberately non-zero: callers must not commit a completed stage.
    process.exitCode = contractStatus === "FAIL" ? 1 : 2;
  }
}
void withAcceptanceLock(root, main).catch((error: unknown) => {
  console.error(
    error instanceof AcceptanceWorkspaceBusy
      ? error.message
      : "P01_RUNNER_FAILED",
  );
  process.exitCode = error instanceof AcceptanceWorkspaceBusy ? 2 : 1;
});
