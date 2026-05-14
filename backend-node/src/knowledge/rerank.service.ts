import { Injectable, Logger } from '@nestjs/common';
import { LlmProviderService } from '../llm-provider/llm-provider.service';

/**
 * 重排（rerank）服务 —— RAG 二阶段检索的第二阶段
 *
 * 第一阶段（在 EmbeddingService 中）：用 embedding + 余弦相似度从全库快速召回候选 Top-N（比如 30 条）
 * 第二阶段（本 service）：用 cross-encoder 重排模型对每个 (query, doc) pair 直接打分，取 Top-K
 *
 * 为什么需要重排：
 *   - embedding 是双塔结构，query 和 doc 各自独立编码，速度快但精度有上限
 *   - cross-encoder 把 query 和 doc 拼起来一起过模型，能捕捉细粒度交互，精度高很多
 *   - 工业实践：embedding 召回 + cross-encoder 重排，最终 Top-K 准确率通常从 60-70% 提到 85-95%
 *
 * 协议：阿里云百炼 DashScope 原生 API（OpenAI 没有 rerank 接口）
 *   POST {API_URL}
 *   Header: Authorization: Bearer ${API_KEY}
 *   Body:   { "model": "gte-rerank-v2", "input": { "query": "...", "documents": ["...","..."] }, "parameters": { "top_n": 5, "return_documents": false } }
 *   Resp:   { "output": { "results": [{ "index": 3, "relevance_score": 0.95 }, ...] } }
 */
@Injectable()
export class RerankService {
  private readonly logger = new Logger(RerankService.name);
  private rerankFailLogged = false;

  constructor(private llmProviderService: LlmProviderService) {}

  /**
   * @returns 重排后的索引数组（指向原 documents 中的位置），长度 = topN；
   *          失败/未配置时回退为 [0, 1, 2, ..., topN-1]（保持原顺序）
   */
  async rerank(query: string, documents: string[], topN: number): Promise<RerankItem[]> {
    if (documents.length === 0) return [];

    const provider = this.llmProviderService.getDefaultRerankProvider();
    if (!provider) {
      return this.identityFallback(documents, topN);
    }

    try {
      const response = await fetch(provider.llmAPIUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.llmAPIKey}`,
        },
        body: JSON.stringify({
          model: provider.modelName,
          input: { query, documents },
          parameters: {
            top_n: Math.min(topN, documents.length),
            return_documents: false,
          },
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      const result = (await response.json()) as DashScopeRerankResp;
      const items = result.output?.results;
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('rerank returned empty results');
      }

      this.rerankFailLogged = false;
      return items.map((it) => ({ index: it.index, score: it.relevance_score }));
    } catch (e) {
      this.logRerankFallback((e as Error).message);
      return this.identityFallback(documents, topN);
    }
  }

  private identityFallback(documents: string[], topN: number): RerankItem[] {
    return documents.slice(0, topN).map((_, i) => ({ index: i, score: 0 }));
  }

  private logRerankFallback(msg: string): void {
    if (!this.rerankFailLogged) {
      this.logger.warn(
        `Rerank API unavailable (${msg}). Falling back to identity (no reordering). ` +
          `This warning will not repeat until the API recovers.`,
      );
      this.rerankFailLogged = true;
    }
  }
}

export interface RerankItem {
  /** 在原 documents 数组中的索引位置 */
  index: number;
  /** 相关度分数（0-1，越大越相关） */
  score: number;
}

interface DashScopeRerankResp {
  output?: {
    results?: { index: number; relevance_score: number }[];
  };
  usage?: { total_tokens: number };
}
