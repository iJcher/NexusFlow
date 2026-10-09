import { parseJson } from '../../common/json.util';
import { safeFetch } from '../../security/safe-fetch';
import { extractByJsonPath } from '../expression/expression-helper';

function tokenCount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('INVALID_TOKEN_USAGE');
  return value;
}

export async function* callLlmStreaming(
  apiUrl: string,
  apiKey: string,
  modelName: string,
  messages: { role: string; content: string }[],
  temperature: number,
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
  enableThinking: boolean,
): AsyncGenerator<string> {
  const body: Record<string, unknown> = {
    model: modelName,
    messages,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (enableThinking) {
    body.enable_thinking = true;
  }

  const response = await safeFetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`LLM_API_HTTP_${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isThinkingStarted = false;
  let isThinkingEnded = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const chunk = parseJson(data);

          const usage = extractByJsonPath(chunk, 'usage');
          if (usage) {
            tokenUsage.promptTokens = tokenCount(
              extractByJsonPath(usage, 'prompt_tokens'),
            );
            tokenUsage.completionTokens = tokenCount(
              extractByJsonPath(usage, 'completion_tokens'),
            );
            tokenUsage.totalTokens = tokenCount(
              extractByJsonPath(usage, 'total_tokens'),
            );
          }

          const delta = extractByJsonPath(chunk, 'choices.0.delta');
          if (!delta) continue;

          const reasoning = extractByJsonPath(delta, 'reasoning_content');
          if (typeof reasoning === 'string' && reasoning) {
            let content = reasoning;
            if (!isThinkingStarted) {
              isThinkingStarted = true;
              content = '<think>' + content;
            }
            yield content;
            continue;
          }

          const answer = extractByJsonPath(delta, 'content');
          if (typeof answer === 'string' && answer) {
            let content = answer;
            if (isThinkingStarted && !isThinkingEnded) {
              isThinkingEnded = true;
              content = '</think>' + content;
            }
            yield content;
          }
        } catch {
          // ignore parse errors
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
