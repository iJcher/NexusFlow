export function redact(text: string): string {
  return text
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]')
    .replace(/\b[A-Za-z0-9_-]{43}\b/g, '[REDACTED_TOKEN_CANDIDATE]')
    .replace(/\b\d{6}\b/g, '[REDACTED_OTP_CANDIDATE]')
    .replace(/(authorization|cookie|set-cookie|password|pepper|secret|refreshToken|accessToken|code)\s*[:=]\s*[^\r\n]+/gi, '$1=[REDACTED]')
    .replace(/nexus-p00-only-[a-z0-9-]+/gi, '[REDACTED_TEST_SECRET]')
    .replace(/nexus-p00-email-[a-z0-9-]+/gi, '[REDACTED_TEST_SECRET]')
    .replace(/postgresql:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
}

export function redactJson(value: unknown): unknown {
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /^(authorization|cookie|set-cookie|password|pepper|secret|refreshToken|accessToken|code)$/i.test(key)
        ? '[REDACTED]' : redactJson(item)]));
  }
  return value;
}
