import { Injectable, Logger } from '@nestjs/common';
import { LlmProviderService } from '../llm-provider/llm-provider.service';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private embeddingUnavailableLogged = false;

  constructor(private llmProviderService: LlmProviderService) {}

  /**
   * 调用 LLM Provider 的 Embedding API 获取文本向量
   * 兼容 OpenAI 格式的 /v1/embeddings 接口
   */
  async getEmbedding(text: string, modelName?: string): Promise<number[]> {
    const provider = await this.findEmbeddingProvider(modelName);
    if (!provider) {
      this.logEmbeddingFallback('No embedding provider configured');
      return this.tfidfFallback(text);
    }

    try {
      const apiUrl = this.buildEmbeddingUrl(provider.llmAPIUrl);
      const model = modelName || 'text-embedding-ada-002';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.llmAPIKey}`,
        },
        body: JSON.stringify({ model, input: text }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${errorText}`);
      }

      const result: any = await response.json();
      return result.data?.[0]?.embedding || [];
    } catch (e: any) {
      this.logEmbeddingFallback(e.message);
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
      const apiUrl = this.buildEmbeddingUrl(provider.llmAPIUrl);
      const model = modelName || 'text-embedding-ada-002';

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${provider.llmAPIKey}`,
        },
        body: JSON.stringify({ model, input: texts }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`${response.status} at ${apiUrl} model=${model}: ${errorText}`);
      }

      const result: any = await response.json();
      this.embeddingUnavailableLogged = false;
      return (result.data || [])
        .sort((a: any, b: any) => a.index - b.index)
        .map((d: any) => d.embedding);
    } catch (e: any) {
      this.logEmbeddingFallback(e.message);
      return texts.map((t) => this.tfidfFallback(t));
    }
  }

  private logEmbeddingFallback(errorMsg: string) {
    if (!this.embeddingUnavailableLogged) {
      this.logger.warn(
        `Embedding API unavailable (${errorMsg}). Falling back to TF-IDF. ` +
          `This warning will not repeat until the API recovers. ` +
          `To use real embeddings, configure a provider that supports /v1/embeddings (e.g. OpenAI official).`,
      );
      this.embeddingUnavailableLogged = true;
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
    return this.llmProviderService.findProviderForEmbedding(modelName);
  }

  /**
   * 从 LLM Provider 的 API URL 构造 embeddings URL。
   * 先剥离到 base（去掉 /chat/completions 和尾斜杠），
   * 如果已经包含版本前缀（/v1 /v2 等）则直接追加 /embeddings，
   * 否则插入 /v1/embeddings。
   *
   * 示例：
   *   https://api.deepseek.com/chat/completions  → https://api.deepseek.com/v1/embeddings
   *   https://api.deepseek.com/v1/chat/completions → https://api.deepseek.com/v1/embeddings
   *   https://www.dogapi.cc/v1                    → https://www.dogapi.cc/v1/embeddings
   *   https://api.openai.com                      → https://api.openai.com/v1/embeddings
   */
  private buildEmbeddingUrl(baseUrl: string): string {
    let url = baseUrl.replace(/\/+$/, '');

    url = url.replace(/\/chat\/completions$/i, '');
    url = url.replace(/\/+$/, '');

    if (/\/v\d+$/i.test(url)) {
      return `${url}/embeddings`;
    }

    return `${url}/v1/embeddings`;
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
