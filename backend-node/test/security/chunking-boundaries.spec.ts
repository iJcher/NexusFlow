import { ChunkingService } from '../../src/knowledge/chunking.service';

// Keep PDF import out of the chunk-boundary tests; no actual PDF is parsed.
jest.mock('pdf-parse', () => jest.fn());

describe('P01 text chunking progress and parameter boundaries', () => {
  const service = new ChunkingService();

  it.each([
    { chunkSize: 0, chunkOverlap: 0 },
    { chunkSize: -1, chunkOverlap: 0 },
    { chunkSize: 1.5, chunkOverlap: 0 },
    { chunkSize: NaN, chunkOverlap: 0 },
    { chunkSize: Infinity, chunkOverlap: 0 },
    { chunkSize: 20, chunkOverlap: -1 },
    { chunkSize: 20, chunkOverlap: 1.5 },
    { chunkSize: 20, chunkOverlap: NaN },
    { chunkSize: 20, chunkOverlap: Infinity },
    { chunkSize: 20, chunkOverlap: 20 },
    { chunkSize: 20, chunkOverlap: 21 },
  ])('rejects invalid chunk parameters immediately: %j', (options) => {
    expect(() =>
      service.chunkText('text that must not hang', options),
    ).toThrow();
  });

  it.each(['fixed', 'paragraph', 'markdown'] as const)(
    'rejects invalid overlap regardless of %s strategy',
    (strategy) => {
      expect(() =>
        service.chunkText('text', {
          strategy,
          chunkSize: 10,
          chunkOverlap: 10,
        }),
      ).toThrow();
    },
  );

  it.each(['fixed', 'paragraph', 'markdown'] as const)(
    'produces nonempty bounded chunks with %s strategy',
    (strategy) => {
      const text =
        '# First\nalpha paragraph\n\n# Second\n' + '长段落内容'.repeat(80);
      const chunks = service.chunkText(text, {
        strategy,
        chunkSize: 40,
        chunkOverlap: 5,
      });
      expect(chunks.length).toBeGreaterThan(1);
      // A monotonic character cursor cannot produce more chunks than characters.
      expect(chunks.length).toBeLessThanOrEqual(text.length);
      for (const [index, chunk] of chunks.entries()) {
        expect(chunk.index).toBe(index);
        expect(chunk.content.trim()).not.toBe('');
        expect(chunk.content.length).toBeLessThanOrEqual(46);
        expect(Number.isInteger(chunk.tokenCount)).toBe(true);
        expect(chunk.tokenCount).toBeGreaterThan(0);
      }
    },
  );

  it('advances even when punctuation creates a break smaller than overlap', () => {
    // At start=0 old code chooses breakPoint=31, overlap=40, then resets to 0.
    const text = 'x'.repeat(30) + '.' + 'y'.repeat(300);
    const chunks = service.chunkText(text, {
      strategy: 'fixed',
      chunkSize: 100,
      chunkOverlap: 40,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(text.length);
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
    expect(chunks[chunks.length - 1].content.endsWith('y')).toBe(true);
  });

  it('keeps zero overlap valid and returns no chunks for blank text', () => {
    expect(
      service
        .chunkText('abcdefghijkl', {
          strategy: 'fixed',
          chunkSize: 4,
          chunkOverlap: 0,
        })
        .map((chunk) => chunk.content),
    ).toEqual(['abcd', 'efgh', 'ijkl']);
    expect(service.chunkText('   \n\n')).toEqual([]);
  });

  it('does not retain entire previous paragraphs when overlap is zero', () => {
    const text = 'aaaaaaaa\n\nbbbbbbbb\n\ncccccccc';
    const chunks = service.chunkText(text, {
      strategy: 'paragraph',
      chunkSize: 10,
      chunkOverlap: 0,
    });
    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'aaaaaaaa',
      'bbbbbbbb',
      'cccccccc',
    ]);
  });
});
