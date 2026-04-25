import { NodeConfig, FlowRuntimeContext, NodeExecuteResult, TokenUsage, LLMChatMessage } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { replacePlaceholders } from '../expression/expression-helper';
import { callLlmStreaming } from '../llm/llm-adapter';

const LEGACY_DEFAULT_PROMPT = '你是 NEXUS 工作流中的智能助手。请基于用户问题给出清晰、准确、简洁的回答。';
const NEXUS_WORKFLOW_ASSISTANT_PROMPT = `你是 NEXUS 工作流设计器的产品向导，必须基于当前系统能力回答用户。

当前产品上下文：
- NEXUS 是类似 Dify 的工作流系统，前端入口从 Studio 创建工作流后进入设计器。
- 推荐新手搭建 AI 知识库问答工作流的最小链路是 Start -> Knowledge -> LLM -> Reply。
- Start 是流程入口；Knowledge 根据用户问题检索知识库；LLM 基于检索结果和用户问题生成回答；Reply 默认会把上一节点输出回复给用户。
- 用户通常不需要手写 {{sys.query}} 或节点 ID；默认 AI 工作流会自动把用户输入交给 LLM。
- 运行前需要在 Models 页面配置模型供应商、在 Knowledge 页面创建知识库并上传文档；若只有一个可用模型或知识库，系统会自动选择。
- 设计器右上角 Save 保存流程，Run 打开对话调试抽屉，执行日志可用于排查问题。

回答规则：
- 如果用户询问“怎么搭建工作流”，优先给 NEXUS 内部的具体点击路径和节点配置，不要推荐 Zapier、Airflow、n8n 等外部工具。
- 回答要一步一步、可操作、简洁。
- 如果用户的问题缺少前提，先给最小可运行方案，再补充可选增强。`;

function resolveSystemPrompt(rawPrompt: string): string {
  const prompt = rawPrompt.trim();
  if (!prompt || prompt === LEGACY_DEFAULT_PROMPT) {
    return NEXUS_WORKFLOW_ASSISTANT_PROMPT;
  }
  return prompt;
}

function buildKnowledgeContextPrompt(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<string> {
  const incomingLines = context.flowConfigInfoForRun.lines.filter((line) => line.toNodeId === node.id);
  return Promise.all(
    incomingLines.map(async (line) => {
      const sourceNode = context.flowConfigInfoForRun.nodes.find((n) => n.id === line.fromNodeId);
      if (sourceNode?.typeName !== 'KnowledgeNode') return '';

      const result = await runtime.getNodeExecuteResult(context, line.fromNodeId);
      const knowledgeContext = result?.result?.context;
      const resultCount = result?.result?.resultCount ?? 0;
      if (typeof knowledgeContext === 'string' && knowledgeContext.trim()) {
        return `以下是 Knowledge 节点检索到的参考资料。回答时必须优先依据这些资料；如果资料不足，再说明缺失信息。\n\n${knowledgeContext}`;
      }
      if (resultCount === 0) {
        return 'Knowledge 节点没有检索到匹配资料。回答时请明确说明当前知识库未命中，并给出基于通用能力的建议。';
      }
      return '';
    }),
  ).then((parts) => parts.filter(Boolean).join('\n\n'));
}

export async function executeLLMNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
  findProvider: (modelName: string) => Promise<any>,
): Promise<NodeExecuteResult> {
  try {
    // modelSelection 格式为 "Provider|modelName"，如 "DeepSeek|deepseek-chat"
    const rawModel = node.modelSelection || node.modelName || '';
    let modelName = rawModel.includes('|') ? rawModel.split('|')[1] : rawModel;
    let provider = await findProvider(modelName);

    if (!modelName && provider?.llmNames?.length) {
      modelName = provider.llmNames[0];
    }

    if (!modelName) {
      return createErrorResult(node.id, 'No model selected. Please add at least one model name in Models, or select a model in the LLM node.');
    }
    if (!provider) return createErrorResult(node.id, `No provider found for model: ${modelName}`);

    const messages: LLMChatMessage[] = [];

    const sysText = node.systemPrompt?.text || node.systemPrompt?.Text || '';
    const resolvedSystemPrompt = resolveSystemPrompt(
      sysText ? await replacePlaceholders(context, runtime, sysText) : '',
    );
    if (resolvedSystemPrompt) {
      messages.push({ role: 'system', content: resolvedSystemPrompt });
    }

    for (const historyMessage of context.chatHistory || []) {
      if (historyMessage.content.trim()) {
        messages.push(historyMessage);
      }
    }

    const knowledgeContextPrompt = await buildKnowledgeContextPrompt(node, context, runtime);
    if (knowledgeContextPrompt) {
      messages.push({ role: 'user', content: knowledgeContextPrompt });
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
