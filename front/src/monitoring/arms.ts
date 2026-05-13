import ArmsRum from '@arms/rum-browser'

type ArmsEnvName = 'prod' | 'gray' | 'pre' | 'daily' | 'local'

const ARMS_ENV_VALUES: readonly ArmsEnvName[] = ['prod', 'gray', 'pre', 'daily', 'local']

function resolveArmsEnv(value: string | undefined, fallback: ArmsEnvName): ArmsEnvName {
  return ARMS_ENV_VALUES.find((item) => item === value) ?? fallback
}

interface ArmsEnv {
  VITE_ARMS_ENABLED?: string
  VITE_ARMS_PID?: string
  VITE_ARMS_ENDPOINT?: string
  VITE_ARMS_ENV?: string
}

let initialized = false

export function setupArmsMonitoring(
  env: ArmsEnv = import.meta.env as unknown as ArmsEnv,
): void {
  if (env.VITE_ARMS_ENABLED !== 'true') return
  if (!env.VITE_ARMS_ENDPOINT) return
  if (typeof window === 'undefined' || initialized) return

  initialized = true

  const fallbackEnv: ArmsEnvName = import.meta.env.MODE === 'production' ? 'prod' : 'daily'

  ArmsRum.init({
    pid: env.VITE_ARMS_PID || '',
    endpoint: env.VITE_ARMS_ENDPOINT,
    env: resolveArmsEnv(env.VITE_ARMS_ENV, fallbackEnv),
    spaMode: 'history',
    collectors: {
      perf: true,
      webVitals: true,
      api: true,
      staticResource: true,
      jsError: true,
      consoleError: true,
      action: true,
    },
    tracing: false,
  })
}
