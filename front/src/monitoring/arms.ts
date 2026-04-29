interface ArmsEnv {
  VITE_ARMS_ENABLED?: string
  VITE_ARMS_PID?: string
  VITE_ARMS_ENDPOINT?: string
}

declare global {
  interface Window {
    __bl?: unknown
  }
}

export function setupArmsMonitoring(env: ArmsEnv = import.meta.env) {
  if (env.VITE_ARMS_ENABLED !== 'true' || !env.VITE_ARMS_PID) return
  if (typeof window === 'undefined' || window.__bl) return

  const script = document.createElement('script')
  script.src = env.VITE_ARMS_ENDPOINT || 'https://retcode.alicdn.com/retcode/bl.js'
  script.crossOrigin = 'anonymous'
  script.onload = () => {
    const BrowserLogger = (window as unknown as { BrowserLogger?: { singleton: (options: Record<string, unknown>) => unknown } }).BrowserLogger
    if (!BrowserLogger) return
    window.__bl = BrowserLogger.singleton({
      pid: env.VITE_ARMS_PID,
      appType: 'web',
      enableSPA: true,
      sendResource: true,
      enableLinkTrace: true,
      environment: import.meta.env.MODE,
    })
  }
  document.head.appendChild(script)
}
