import { Injectable, Logger } from '@nestjs/common';
import { LlmProviderService } from '../llm-provider/llm-provider.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private llmProviderService: LlmProviderService) {}

  /**
   * 调用 LLM Provider 的 Embedding API 获取文本向量
   * 兼容 OpenAI 格式的 /v1/embeddings 接口
   */
  async getEmbedding(text: string, modelName?: string): Promise<number[]> {
    const provider = await this.findEmbeddingProvider(modelName);
    if (!provider) {
      this.logger.warn('No embedding provider found, using TF-IDF fallback');
      return this.tfidfFallback(text);
    }

    try {
      const apiUrl = provider.llmAPIUrl.replace(/\/chat\/completions\/?$/, '/embeddings');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.llmAPIKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'text-embedding-ada-002',
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${errorText}`);
      }

      const result: any = await response.json();
      return result.data?.[0]?.embedding || [];
    } catch (e: any) {
      this.logger.error(`Embedding API failed: ${e.message}, using TF-IDF fallback`);
      return this.tfidfFallback(text);
    }
  }

  /**
   * 批量获取 embedding
   */
  async getEmbeddings(texts: string[], modelName?: string): Promise<number[][]> {
    const provider = await this.findEmbeddingProvider(modelName);
    if (!provider) {
      return texts.map((t) => this.tfidfFallback(t));
    }

    try {
      const apiUrl = provider.llmAPIUrl.replace(/\/chat\/completions\/?$/, '/embeddings');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.llmAPIKey}`,
        },
        body: JSON.stringify({
          model: modelName || 'text-embedding-ada-002',
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error ${response.status}`);
      }

      const result: any = await response.json();
      return (result.data || [])
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
    } catch (e: any) {
      this.logger.error(`Batch embedding failed: ${e.message}, using TF-IDF fallback`);
      return texts.map((t) => this.tfidfFallback(t));
    }
  }

  /**
   * 计算两个向量的余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private async findEmbeddingProvider(modelName?: string): Promise<any> {
    if (modelName) {
      return this.llmProviderService.findProviderByModelName(modelName);
    }
    const providers = await this.llmProviderService.getAll();
    return providers?.[0] || null;
  }

  /**
   * TF-IDF 降级方案：当没有 Embedding API 时，使用基于词频的简单向量化
   * 生成固定维度（256维）的稀疏向量
   */
  private tfidfFallback(text: string): number[] {
    const dim = 256;
    const vector = new Array(dim).fill(0);
    const tokens = this.tokenize(text);
    for (const token of tokens) {
      const hash = this.hashString(token);
      const idx = Math.abs(hash) % dim;
      vector[idx] += 1;
    }
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dim; i++) vector[i] /= norm;
    }
    return vector;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return hash;
  }
}
