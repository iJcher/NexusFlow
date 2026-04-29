import { Injectable } from '@nestjs/common';

export interface TextChunk {
  content: string;
  index: number;
  tokenCount: number;
}

@Injectable()
export class ChunkingService {
  /**
   * 将文本按策略分块
   * 支持固定大小分块（带重叠）和段落感知分块
   */
  chunkText(
    text: string,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
      strategy?: 'fixed' | 'paragraph' | 'markdown';
    } = {},
  ): TextChunk[] {
    const { chunkSize = 500, chunkOverlap = 50, strategy = 'paragraph' } = options;

    if (!text || text.trim().length === 0) return [];

    const rawChunks =
      strategy === 'markdown'
        ? this.markdownChunk(text, chunkSize, chunkOverlap)
        : strategy === 'paragraph'
          ? this.paragraphChunk(text, chunkSize, chunkOverlap)
          : this.fixedChunk(text, chunkSize, chunkOverlap);

    return rawChunks
      .filter((c) => c.trim().length > 0)
      .map((content, index) => ({
        content: content.trim(),
        index,
        tokenCount: this.estimateTokens(content),
      }));
  }

  /**
   * 段落感知分块：按自然段落边界切分，超长段落再做固定切分
   */
  private paragraphChunk(text: string, maxSize: number, overlap: number): string[] {
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const para of paragraphs) {
      if (para.length > maxSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        const subChunks = this.fixedChunk(para, maxSize, overlap);
        chunks.push(...subChunks);
        continue;
      }

      if (currentChunk.length + para.length + 1 > maxSize) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk);
          const overlapText = currentChunk.slice(-overlap);
          currentChunk = overlapText + '\n' + para;
        } else {
          currentChunk = para;
        }
      } else {
        currentChunk = currentChunk ? currentChunk + '\n\n' + para : para;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Markdown 结构感知分块：优先按标题切分，保留标题上下文。
   */
  private markdownChunk(text: string, maxSize: number, overlap: number): string[] {
    const sections = text
      .split(/(?=^#{1,6}\s+)/m)
      .map((section) => section.trim())
      .filter(Boolean);

    if (sections.length <= 1) {
      return this.paragraphChunk(text, maxSize, overlap);
    }

    return sections.flatMap((section) =>
      section.length > maxSize
        ? this.paragraphChunk(section, maxSize, overlap)
        : [section],
    );
  }

  /**
   * 固定大小分块，按字符数切分，带重叠
   */
  private fixedChunk(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let breakPoint = end;

      if (end < text.length) {
        const searchArea = text.substring(Math.max(start, end - 100), end);
        const lastBreak = Math.max(
          searchArea.lastIndexOf('。'),
          searchArea.lastIndexOf('.'),
          searchArea.lastIndexOf('\n'),
          searchArea.lastIndexOf('！'),
          searchArea.lastIndexOf('？'),
        );
        if (lastBreak > 0) {
          breakPoint = end - 100 + lastBreak + 1;
          if (breakPoint <= start) breakPoint = end;
        }
      }

      chunks.push(text.substring(start, breakPoint));
      start = breakPoint - overlap;
      if (start < 0) start = 0;
      if (breakPoint >= text.length) break;
    }
    return chunks;
  }

  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars * 1.5 + otherChars / 4);
  }

  /**
   * 从文件内容提取纯文本
   */
  async extractText(buffer: Buffer, fileType: string): Promise<string> {
    switch (fileType.toLowerCase()) {
      case '.txt':
      case '.md':
      case '.csv':
      case '.json':
      case '.log':
        return buffer.toString('utf-8');

      case '.pdf':
        return this.extractPdfText(buffer);

      default:
        return buffer.toString('utf-8');
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    try {
      // pdf-parse@1.x is CJS; require() is the most reliable way in NestJS
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(buffer);
      return result.text || '';
    } catch (e: any) {
      throw new Error(`PDF parsing failed: ${e.message}`);
    }
  }
}
