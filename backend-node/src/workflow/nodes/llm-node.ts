import { NodeConfig, FlowRuntimeContext, NodeExecuteResult, TokenUsage } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { replacePlaceholders } from '../expression/expression-helper';
import { callLlmStreaming } from '../llm/llm-adapter';

export async function executeLLMNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
  findProvider: (modelName: string) => Promise<any>,
): Promise<NodeExecuteResult> {
  try {
    // modelSelection 格式为 "Provider|modelName"，如 "DeepSeek|deepseek-chat"
    const rawModel = node.modelSelection || node.modelName || '';
    const modelName = rawModel.includes('|') ? rawModel.split('|')[1] : rawModel;
    if (!modelName) return createErrorResult(node.id, 'No model configured');

    const provider = await findProvider(modelName);
    if (!provider) return createErrorResult(node.id, `No provider found for model: ${modelName}`);

    const messages: { role: string; content: string }[] = [];

    const sysText = node.systemPrompt?.text || node.systemPrompt?.Text || '';
    if (sysText) {
      const resolved = await replacePlaceholders(context, runtime, sysText);
      if (resolved) messages.push({ role: 'system', content: resolved });
    }

    const usrText = node.userPrompt?.text || node.userPrompt?.Text || '';
    if (usrText) {
      const resolved = await replacePlaceholders(context, runtime, usrText);
      if (resolved) messages.push({ role: 'user', content: resolved });
    }

    // If userPrompt is not configured, fallback to current chat query.
    // This keeps chat-test behavior aligned with user expectation.
    if (!usrText && context.request?.query) {
      messages.push({ role: 'user', content: context.request.query });
    }

    if (messages.length === 0) {
      return createErrorResult(node.id, 'No prompt provided');
    }

    const temperature = node.temperature ?? 0.7;
    const enableThinking = node.enableThinking ?? false;
    const tokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const streamingExecutor = async function* (): AsyncGenerator<string> {
      yield* callLlmStreaming(
        provider.llmAPIUrl,
        provider.llmAPIKey,
        modelName,
        messages,
        temperature,
        tokenUsage,
        enableThinking,
      );
    };

    return createSuccessResult(node.id, { tokenUsage }, streamingExecutor);
  } catch (e: any) {
    return createErrorResult(node.id, `LLM node failed: ${e.message}`);
  }
}
