export interface ParsedCurlResult {
  method?: string
  url?: string
  headers?: string
  query?: string
  body?: string
}

function stripQuotes(text: string): string {
  if (!text) return text
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('\'') && text.endsWith('\''))) {
    return text.slice(1, -1)
  }
  return text
}

export function parseCurlCommand(cmd: string): ParsedCurlResult {
  const result: ParsedCurlResult = {}
  if (!cmd) return result

  const normalized = cmd.replace(/\\\r?\n/g, ' ').trim()
  const tokens = normalized.split(/\s+/).filter(Boolean)
  if (!tokens.length) return result

  const headerLines: string[] = []
  const bodyParts: string[] = []

  let i = 0
  const curlIndex = tokens.findIndex(t => t.toLowerCase() === 'curl')
  if (curlIndex >= 0) i = curlIndex + 1

  for (; i < tokens.length; i++) {
    const t = tokens[i]

    if ((t === '-X' || t === '--request') && i + 1 < tokens.length) {
      result.method = tokens[++i].toUpperCase()
      continue
    }

    if ((t === '-H' || t === '--header') && i + 1 < tokens.length) {
      let header = tokens[++i]
      const firstChar = header[0]
      const isQuoted = firstChar === '"' || firstChar === '\''

      if (isQuoted && !header.endsWith(firstChar)) {
        while (i + 1 < tokens.length) {
          const nextTok = tokens[++i]
          header += ` ${nextTok}`
          if (nextTok.endsWith(firstChar)) break
        }
      }

      headerLines.push(stripQuotes(header))
      continue
    }

    if ((t === '--data' || t === '--data-raw' || t === '-d') && i + 1 < tokens.length) {
      let body = tokens[++i]
      const firstChar = body[0]
      const isQuoted = firstChar === '"' || firstChar === '\''

      if (isQuoted && !body.endsWith(firstChar)) {
        while (i + 1 < tokens.length) {
          const nextTok = tokens[++i]
          body += ` ${nextTok}`
          if (nextTok.endsWith(firstChar)) break
        }
      }

      bodyParts.push(stripQuotes(body))
      continue
    }

    if (!t.startsWith('-') && !result.url) {
      result.url = stripQuotes(t)
    }
  }

  if (!result.method) {
    result.method = bodyParts.length > 0 ? 'POST' : 'GET'
  }

  if (result.url && result.url.includes('?')) {
    const [base, q] = result.url.split(/\?(.+)/)
    result.url = base
    result.query = q ? `?${q}` : undefined
  }

  if (headerLines.length) result.headers = headerLines.join('\n')
  if (bodyParts.length) result.body = bodyParts.join('\n')

  return result
}
