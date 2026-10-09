# P02-08 independent real Docker test history

Test: backend-node/test/runs/js-isolation.e2e-spec.ts.
Command (backend-node): pnpm exec jest --config test/jest-runs-e2e.json --runInBand --runTestsByPath test/runs/js-isolation.e2e-spec.ts.

## First real run: FAIL

10 tests: 7 failed, 3 passed. Valid JSON, secret/filesystem checks, actual inspect, network, timeout, output limit and cancellation failed. Direct reproduction with the same secure docker flags reported: `docker: --pid: invalid PID mode`. The executor used unsupported --pid=private, so containers never started. Main agent removed only the unsupported option; default private PID mode is now asserted with actual inspect HostConfig.PidMode equal to the empty string (not host). The memory and capacity tests were strengthened to require proven successful startup and two actually running containers, avoiding false passes on startup failure.

## Second real run: FAIL

12 tests: 11 passed, 1 failed. Network case used host.docker.internal; in network=none its DNS resolution can exceed socket connection timeout, producing JS_TIMEOUT rather than a completed denial result. Test correction: inspect the actual default Docker bridge Gateway IP and attempt that numeric host gateway plus public numeric IP 1.1.1.1. No DNS, security-limit or connection assertions were relaxed.

## Third real run: PASS

12 tests passed, 0 failed. Suite elapsed 10.157 seconds. Test file ESLint also exited successfully. Uses only already-cached node@sha256:d2166de198f26e17e5a442f537754dd616ab069c47cc57b889310a717e0abbf9; does not pull images, modify Docker settings, mount host paths or remove unrelated containers. Executor owns cleanup. Test environment variables are restored.

Covered: JSON execution; worker secret isolation; inaccessible host path and Docker socket; root filesystem writes denied; UID 65532; actual CPU/memory/swap/pids/capability/no-new-privileges/network/PID/mount inspection; host gateway and public IP connection denial; infinite loop timeout; memory failure; JSON and raw-output limit; cancellation cleanup; exactly two concurrently running containers and third-request rejection; default disabled and image pinning fail-closed; input/code limits; graph compilation feature gate and forbidden caller permissions.

Scope limit: healthy host HTTP service and a normal NodeRegistry transform continue during a CPU-bound JS invocation. This is not a full deployed Nest HTTP App availability or load test. These focused tests do not independently establish the full P02 gate or P00/P01 prerequisites. Parent agent must freeze the source and run the complete acceptance suite.
