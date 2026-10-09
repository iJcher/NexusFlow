interface MailSummary { ID: string; To: Array<{ Address: string }>; Created: string }
interface MailDetail { ID: string; Text: string; HTML: string; MessageID?: string; Date?: string }

export async function waitForCode(email: string, since: Date, timeoutMs = 15_000) {
  const base = process.env.P00_MAILPIT_URL ?? 'http://127.0.0.1:18025';
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Mailpit must be loopback-only');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(`${base}/api/v1/messages`, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error(`Mailpit listing failed: ${response.status}`);
    const list = await response.json() as { messages: MailSummary[] };
    const matches = list.messages.filter(message => message.To.some(to => to.Address === email)
      && Date.parse(message.Created) >= since.getTime() - 1000);
    for (const summary of matches) {
      const response = await fetch(`${base}/api/v1/message/${encodeURIComponent(summary.ID)}`, { signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error(`Mailpit message failed: ${response.status}`);
      const message = await response.json() as MailDetail;
      const code = message.Text.match(/(?<!\d)\d{6}(?!\d)/)?.[0];
      if (code) return { code, messageId: message.MessageID ?? summary.ID, receivedAt: summary.Created };
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Expected SMTP mail was not received by Mailpit before timeout');
}
