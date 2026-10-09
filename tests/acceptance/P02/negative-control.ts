import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Deliberately mutate only the test-process scheduler export. Production source,
// database, services and the frozen contract remain unchanged.
const root = resolve(__dirname, "../../..");
const backend = resolve(root, "backend-node");
const directory = resolve(
  process.env.P02_NEGATIVE_ARTIFACT_DIR ||
    resolve(
      root,
      "artifacts/acceptance/P02/negative-control-" +
        Date.now() +
        "-" +
        process.pid,
    ),
);
mkdirSync(directory, { recursive: true });
interface Report {
  numFailedTests: number;
  numPassedTests: number;
  numPendingTests: number;
  numTotalTests: number;
  testResults: { assertionResults: { status: string; fullName: string }[] }[];
}
function execute(mode: "baseline" | "early-join"): {
  code: number | null;
  report: Report;
} {
  const reportFile = resolve(directory, mode + ".json");
  const child = spawnSync(
    process.execPath,
    [
      resolve(backend, "node_modules/jest/bin/jest.js"),
      "--config",
      "test/jest-runs-unit.json",
      "--runInBand",
      "--json",
      "--outputFile",
      reportFile,
    ],
    {
      cwd: backend,
      windowsHide: true,
      timeout: 60000,
      encoding: "utf8",
      env: {
        ...process.env,
        P02_NEGATIVE_CONTROL: mode === "early-join" ? mode : "",
        JEST_JUNIT_OUTPUT_DIR: resolve(directory, mode),
      },
    },
  );
  if (child.error || child.signal)
    throw new Error("Negative control process did not complete");
  return {
    code: child.status,
    report: JSON.parse(readFileSync(reportFile, "utf8")) as Report,
  };
}
try {
  const good = execute("baseline");
  if (
    good.code !== 0 ||
    good.report.numFailedTests !== 0 ||
    good.report.numPendingTests !== 0 ||
    good.report.numPassedTests !== 52
  )
    throw new Error("Baseline must independently pass all 52 core assertions");
  const bad = execute("early-join");
  const failedJoin = bad.report.testResults
    .flatMap((result) => result.assertionResults)
    .filter(
      (assertion) =>
        assertion.status === "failed" && assertion.fullName.includes("P02-01"),
    );
  if (
    bad.code !== 1 ||
    bad.report.numPendingTests !== 0 ||
    bad.report.numTotalTests !== 52 ||
    bad.report.numFailedTests < 1 ||
    failedJoin.length < 1
  ) {
    throw new Error(
      "Broken scheduler was not rejected by the original Join assertions",
    );
  }
  process.stdout.write(
    JSON.stringify({
      caseId: "P02-NEGATIVE",
      status: "PASS",
      baselinePassed: good.report.numPassedTests,
      brokenFailed: bad.report.numFailedTests,
      artifactDirectory: directory,
    }) + "\n",
  );
} catch (error) {
  process.stderr.write(
    (error instanceof Error ? error.message : "Negative control failed") + "\n",
  );
  process.exitCode = 1;
}
