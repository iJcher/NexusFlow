import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { replacePlaceholders } from '../expression/expression-helper';

/**
 * 知识库检索节点
 *
 * 节点配置字段：
 * - knowledgeBaseIds: string[]  — 要检索的知识库 ID 列表
 * - queryExpression: { text: string } — 检索 query 表达式，支持 {{sys.query}} 等占位符
 * - topK: number — 返回 top K 个结果（默认 5）
 * - threshold: number — 相似度阈值（默认 0.3）
 * - embeddingModel: string — 可选的 embedding 模型名
 * - outputVariable: string — 将检索结果写入的变量名（默认 "knowledge_context"）
 */
export async function executeKnowledgeNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
  searchFn: (
    knowledgeBaseIds: bigint[],
    query: string,
    options: { topK?: number; threshold?: number; embeddingModel?: string },
  ) => Promise<any[]>,
): Promise<NodeExecuteResult> {
  try {
    const knowledgeBaseIds: string[] = node.knowledgeBaseIds || [];

    const queryText = node.queryExpression?.text || node.queryExpression?.Text || '{{sys.query}}';
    const resolvedQuery = await replacePlaceholders(context, runtime, queryText);

    if (!resolvedQuery?.trim()) {
      return createErrorResult(node.id, 'Empty query for knowledge retrieval');
    }

    const topK = node.topK ?? 5;
    const threshold = node.threshold ?? 0.3;
    const embeddingModel = node.embeddingModel || undefined;

    const results = await searchFn(
      knowledgeBaseIds.map((id: string) => BigInt(id)),
      resolvedQuery,
      { topK, threshold, embeddingModel },
    );

    const contextText = results.length
      ? results
          .map(
            (r, i) =>
              `[${i + 1}] (Source: ${r.fileName}, Chunk ${r.chunkIndex + 1}, Similarity: ${(r.similarity * 100).toFixed(1)}%)\n${r.content}`,
          )
          .join('\n\n---\n\n')
      : '';

    const outputVariable = node.outputVariable || 'knowledge_context';
    const targetVar = context.variables.find(
      (v) => v.name.toLowerCase() === outputVariable.toLowerCase(),
    );
    if (targetVar) {
      targetVar.value = contextText;
      targetVar.hasValue = true;
    } else {
      context.variables.push({
        typeName: 'String',
        name: outputVariable,
        value: contextText,
        hasValue: true,
      });
    }

    return createSuccessResult(node.id, {
      context: contextText,
      resultCount: results.length,
      results: results.map((r) => ({
        fileName: r.fileName,
        chunkIndex: r.chunkIndex,
        similarity: r.similarity,
        content: r.content.substring(0, 200),
      })),
    });
  } catch (e: any) {
    return createErrorResult(node.id, `Knowledge node failed: ${e.message}`);
  }
}
