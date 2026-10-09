import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TemplateService } from '../../src/template/template.service';
import { ConversationService } from '../../src/conversation/conversation.service';
import { parseJson, parseStringList } from '../../src/common/json.util';

describe('P01 real PostgreSQL tenant regressions', () => {
  const marker = 'p01-security-' + randomUUID();
  const base =
    BigInt(Date.now()) * 10000n + BigInt(Math.floor(Math.random() * 1000));
  const alice = base;
  const bob = base + 1n;
  const flow = base + 2n;
  const otherFlow = base + 3n;
  const templateIds = [base + 4n, base + 5n, base + 6n];
  const conversationIds = ['recent', 'older', 'foreign', 'other-flow'].map(
    (id) => marker + '-' + id,
  );
  let prisma: PrismaService;
  let templates: TemplateService;
  let conversations: ConversationService;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL || '');
    if (
      process.env.NODE_ENV !== 'test' ||
      database.hostname !== '127.0.0.1' ||
      database.port !== '15432' ||
      database.pathname !== '/nexus_test'
    ) {
      throw new Error(
        'BLOCKED: security regressions require isolated 127.0.0.1:15432/nexus_test',
      );
    }
    prisma = new PrismaService();
    await prisma.$connect();
    templates = new TemplateService(prisma);
    conversations = new ConversationService(prisma);
    // Suppress only unrelated global seed writes. Access queries execute against real PG.
    jest
      .spyOn(
        templates as unknown as { ensureOfficialTemplates(): Promise<void> },
        'ensureOfficialTemplates',
      )
      .mockResolvedValue(undefined);
    await prisma.flowEntity.createMany({
      data: [
        { id: flow, ownerUserId: alice, displayName: marker },
        { id: otherFlow, ownerUserId: bob, displayName: marker },
      ],
    });
    await prisma.flowTemplateEntity.createMany({
      data: [
        {
          id: templateIds[0],
          ownerUserId: alice,
          name: marker + '-alice',
          category: marker,
          createdAt: new Date('2026-01-03'),
        },
        {
          id: templateIds[1],
          ownerUserId: bob,
          name: marker + '-bob',
          description: marker + '-description-only',
          category: marker,
          createdAt: new Date('2026-01-02'),
        },
        {
          id: templateIds[2],
          name: marker + '-official',
          category: marker,
          isOfficial: true,
          createdAt: new Date('2026-01-01'),
        },
      ],
    });
    await prisma.flowChatConversationEntity.createMany({
      data: [
        {
          conversationId: conversationIds[0],
          ownerUserId: alice,
          user: marker,
          flowId: flow,
          updatedAt: new Date('2026-01-03'),
        },
        {
          conversationId: conversationIds[1],
          ownerUserId: alice,
          user: marker,
          flowId: flow,
          updatedAt: new Date('2026-01-01'),
        },
        {
          conversationId: conversationIds[2],
          ownerUserId: bob,
          user: marker,
          flowId: flow,
          updatedAt: new Date('2026-01-02'),
        },
        {
          conversationId: conversationIds[3],
          ownerUserId: alice,
          user: marker,
          flowId: otherFlow,
          updatedAt: new Date('2026-01-02'),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.flowChatConversationEntity.deleteMany({
      where: { conversationId: { in: conversationIds } },
    });
    await prisma.flowTemplateEntity.deleteMany({
      where: {
        OR: [
          { id: { in: templateIds } },
          { ownerUserId: { in: [alice, bob] } },
        ],
      },
    });
    await prisma.flowEntity.deleteMany({
      where: { id: { in: [flow, otherFlow] } },
    });
    await prisma.$disconnect();
    jest.restoreAllMocks();
  });

  it('keyword OR preserves owner/public access predicate', async () => {
    const result = await templates.getList(
      { keyword: marker, category: marker },
      alice.toString(),
    );
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.id).sort()).toEqual(
      [templateIds[0], templateIds[2]].map(String).sort(),
    );
  });

  it('description keyword cannot expose another tenant private template', async () => {
    const result = await templates.getList(
      { keyword: marker + '-description-only', category: marker },
      alice.toString(),
    );
    expect(result.total).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('no keyword and pagination preserve accessible total and official-first order', async () => {
    const first = await templates.getList(
      { category: marker, pageIndex: 1, pageSize: 1 },
      alice.toString(),
    );
    const second = await templates.getList(
      { category: marker, pageIndex: 2, pageSize: 1 },
      alice.toString(),
    );
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.items.map((item) => item.id)).toEqual([
      String(templateIds[2]),
    ]);
    expect(second.items.map((item) => item.id)).toEqual([
      String(templateIds[0]),
    ]);
  });

  it('official filter remains public and private filter stays tenant-scoped', async () => {
    const official = await templates.getList(
      { category: marker, isOfficial: true },
      bob.toString(),
    );
    const privateOnly = await templates.getList(
      { category: marker, isOfficial: false },
      bob.toString(),
    );
    expect(official.items.map((item) => item.id)).toEqual([
      String(templateIds[2]),
    ]);
    expect(privateOnly.items.map((item) => item.id)).toEqual([
      String(templateIds[1]),
    ]);
    expect(await templates.getById(templateIds[0], bob.toString())).toBeNull();
    expect(
      await templates.getById(templateIds[2], bob.toString()),
    ).not.toBeNull();
  });

  it('ordinary user cannot forge an official template', async () => {
    try {
      await templates.create(
        { name: marker + '-forged', category: marker, isOfficial: true },
        alice.toString(),
        marker,
      );
    } catch (error: unknown) {
      // Rejecting the forbidden field or safely forcing false are both valid contracts.
      expect(error).toBeInstanceOf(ForbiddenException);
    }
    const forged = await prisma.flowTemplateEntity.findMany({
      where: { ownerUserId: alice, name: marker + '-forged' },
    });
    expect(forged.every((item) => !item.isOfficial)).toBe(true);
    const visible = await templates.getList(
      { keyword: marker + '-forged', category: marker },
      bob.toString(),
    );
    expect(visible.total).toBe(0);
  });

  it('createFromFlow refuses foreign owned flow and does not create a template', async () => {
    const before = await prisma.flowTemplateEntity.count({
      where: { ownerUserId: alice },
    });
    expect(
      await templates.createFromFlow(
        otherFlow,
        { name: marker },
        alice.toString(),
        marker,
      ),
    ).toBeNull();
    expect(
      await prisma.flowTemplateEntity.count({ where: { ownerUserId: alice } }),
    ).toBe(before);
  });

  it('foreign tenant cursor cannot alter owner pagination', async () => {
    const baseline = await conversations.getLocalConversations(
      flow,
      alice.toString(),
    );
    const foreign = await conversations.getLocalConversations(
      flow,
      alice.toString(),
      conversationIds[2],
    );
    expect(foreign).toEqual(baseline);
    expect(baseline.data.map((item) => item.id)).toEqual(
      conversationIds.slice(0, 2),
    );
  });

  it('same owner but foreign flow cursor cannot alter current flow pagination', async () => {
    const baseline = await conversations.getLocalConversations(
      flow,
      alice.toString(),
    );
    const foreignFlow = await conversations.getLocalConversations(
      flow,
      alice.toString(),
      conversationIds[3],
    );
    expect(foreignFlow).toEqual(baseline);
  });

  it('valid tenant cursor retains expected older-page behavior', async () => {
    const page = await conversations.getLocalConversations(
      flow,
      alice.toString(),
      conversationIds[0],
      1,
    );
    expect(page.data.map((item) => item.id)).toEqual([conversationIds[1]]);
  });
});

describe('P01 stored JSON guards', () => {
  it('reads normal nested JSON and string lists without changing values', () => {
    expect(parseJson('{"a":[1,true,null,{"b":"中文"}]}')).toEqual({
      a: [1, true, null, { b: '中文' }],
    });
    expect(parseStringList('["a","中文"]')).toEqual(['a', '中文']);
    expect(parseStringList('[]')).toEqual([]);
  });
  it.each([
    '{"__proto__":{"polluted":true}}',
    '{"nested":{"constructor":{}}}',
    '{"prototype":{}}',
  ])('rejects unsafe key %s', (input) => {
    expect(() => parseJson(input)).toThrow();
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('rejects oversized JSON and excessive nesting', () => {
    expect(() => parseJson(JSON.stringify('x'.repeat(262144)))).toThrow();
    expect(() => parseJson('['.repeat(34) + '0' + ']'.repeat(34))).toThrow();
  });
  it.each(['{}', '[1]', '["a",null]', 'null'])(
    'rejects non-string-list %s',
    (input) => {
      expect(() => parseStringList(input)).toThrow();
    },
  );
});
