export async function* callLlmStreaming(
  apiUrl: string,
  apiKey: string,
  modelName: string,
  messages: { role: string; content: string }[],
  temperature: number,
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number },
  enableThinking: boolean,
): AsyncGenerator<string> {
  const body: any = {
    model: modelName,
    messages,
    temperature,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (enableThinking) {
    body.enable_thinking = true;
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM API error ${response.status}: ${errorText}`);
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
          const chunk = JSON.parse(data);

          if (chunk.usage) {
            tokenUsage.promptTokens = chunk.usage.prompt_tokens ?? 0;
            tokenUsage.completionTokens = chunk.usage.completion_tokens ?? 0;
            tokenUsage.totalTokens = chunk.usage.total_tokens ?? 0;
          }

          const delta = chunk.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.reasoning_content) {
            let content = delta.reasoning_content;
            if (!isThinkingStarted) {
              isThinkingStarted = true;
              content = '<think>' + content;
            }
            yield content;
            continue;
          }

          if (delta.content) {
            let content = delta.content;
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
