import { randomBytes, randomUUID } from 'node:crypto';
import { FlowLLMProviderEntity, McpServerEntity, Prisma } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  SecretVault,
  connectionSecretContext,
} from '../../src/security/secret-vault';
import { migrateConnectionSecrets } from '../../src/security/secret-migration';
import { LlmProviderService } from '../../src/llm-provider/llm-provider.service';
import { McpService } from '../../src/mcp/mcp.service';

const saved = {
  keys: process.env.CONNECTION_ENCRYPTION_KEYS,
  active: process.env.CONNECTION_ACTIVE_KEY_ID,
  mode: process.env.NODE_ENV,
};
const keyA = randomBytes(32).toString('base64');
const keyB = randomBytes(32).toString('base64');
function configure(
  keys: Record<string, string> = { test_a: keyA },
  active = 'test_a',
) {
  process.env.CONNECTION_ENCRYPTION_KEYS = JSON.stringify(keys);
  process.env.CONNECTION_ACTIVE_KEY_ID = active;
}
function restore() {
  for (const [name, value] of [
    ['CONNECTION_ENCRYPTION_KEYS', saved.keys],
    ['CONNECTION_ACTIVE_KEY_ID', saved.active],
    ['NODE_ENV', saved.mode],
  ]) {
    if (value === undefined) delete process.env[name!];
    else process.env[name!] = value;
  }
}

describe('P01 connection cryptography runtime', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    configure();
  });
  afterAll(restore);
  const aad = connectionSecretContext('provider', 1n, 2n, 'apiKey');
  it.each(['', 'sk-secret-example', '中文密钥🔐'])(
    'round trips UTF-8, including empty (%s)',
    (plain) => {
      const vault = new SecretVault();
      const sealed = vault.seal(plain, aad);
      expect(vault.isSealed(sealed)).toBe(true);
      expect(sealed).toMatch(/^nexus-secret:v1:test_a:/);
      expect(vault.open(sealed, aad)).toBe(plain);
      if (plain) expect(sealed).not.toContain(plain);
    },
  );
  it('uses randomized nonces for identical plaintext and context', () => {
    const vault = new SecretVault();
    const first = vault.seal('same', aad);
    const second = vault.seal('same', aad);
    expect(first).not.toBe(second);
    expect(vault.open(first, aad)).toBe('same');
    expect(vault.open(second, aad)).toBe('same');
  });
  it.each([
    connectionSecretContext('provider', 9n, 2n, 'apiKey'),
    connectionSecretContext('provider', 1n, 9n, 'apiKey'),
    connectionSecretContext('provider', 1n, 2n, 'otherField'),
    connectionSecretContext('mcp', 1n, 2n, 'apiKey'),
  ])('rejects resource, owner, field, or kind swapping', (wrongAad) => {
    const vault = new SecretVault();
    expect(() => vault.open(vault.seal('secret', aad), wrongAad)).toThrow(
      'CONNECTION_SECRET_UNAVAILABLE',
    );
  });
  it('rejects plaintext and unsupported envelope versions', () => {
    const vault = new SecretVault();
    expect(() => vault.open('plaintext', aad)).toThrow(
      'CONNECTION_SECRET_UNAVAILABLE',
    );
    expect(() =>
      vault.open(vault.seal('secret', aad).replace(':v1:', ':v9:'), aad),
    ).toThrow('CONNECTION_SECRET_UNAVAILABLE');
  });
  it.each([3, 4, 5])(
    'rejects tampering of nonce, tag, or ciphertext segment %s',
    (index) => {
      const vault = new SecretVault();
      const parts = vault.seal('never-log-this', aad).split(':');
      const part = parts[index];
      parts[index] = (part[0] === 'A' ? 'B' : 'A') + part.slice(1);
      expect(() => vault.open(parts.join(':'), aad)).toThrow(
        'CONNECTION_SECRET_UNAVAILABLE',
      );
    },
  );
  it('rejects wrong keys and removed keys without echoing secret', () => {
    const sealed = new SecretVault().seal('never-log-this', aad);
    configure({ test_a: keyB });
    expect(() => new SecretVault().open(sealed, aad)).toThrow(
      'CONNECTION_SECRET_UNAVAILABLE',
    );
    configure({ test_b: keyB }, 'test_b');
    expect(() => new SecretVault().open(sealed, aad)).toThrow(
      'CONNECTION_SECRET_UNAVAILABLE',
    );
  });
  it('supports key rotation while retaining old decryption key', () => {
    const old = new SecretVault().seal('old', aad);
    configure({ test_a: keyA, test_b: keyB }, 'test_b');
    const rotated = new SecretVault();
    expect(rotated.open(old, aad)).toBe('old');
    expect(rotated.seal('new', aad)).toMatch(/^nexus-secret:v1:test_b:/);
  });
  it.each([
    ['{}', 'test_a'],
    [JSON.stringify({ test_a: randomBytes(31).toString('base64') }), 'test_a'],
    [JSON.stringify({ test_a: keyA }), 'absent'],
    ['not-json', 'test_a'],
    [JSON.stringify({ 'invalid key': keyA }), 'invalid key'],
  ])('fails closed on invalid key configuration', (keys, active) => {
    process.env.CONNECTION_ENCRYPTION_KEYS = keys;
    process.env.CONNECTION_ACTIVE_KEY_ID = active;
    expect(() => new SecretVault()).toThrow(
      'CONNECTION_ENCRYPTION_CONFIG_INVALID',
    );
  });
  it('rejects missing configuration and production test key', () => {
    delete process.env.CONNECTION_ENCRYPTION_KEYS;
    expect(() => new SecretVault()).toThrow(
      'CONNECTION_ENCRYPTION_CONFIG_INVALID',
    );
    configure();
    process.env.NODE_ENV = 'production';
    expect(() => new SecretVault()).toThrow(
      'CONNECTION_ENCRYPTION_CONFIG_INVALID',
    );
  });
  it('bounds plaintext by UTF-8 bytes', () => {
    const vault = new SecretVault();
    expect(() => vault.seal('x'.repeat(65536), aad)).not.toThrow();
    expect(() => vault.seal('中'.repeat(22000), aad)).toThrow(
      'CONNECTION_SECRET_SIZE',
    );
  });
});

describe('P01 connection secrets real PostgreSQL', () => {
  const marker = 'p01-secret-' + randomUUID();
  const alice =
    BigInt(Date.now()) * 100000n + BigInt(Math.floor(Math.random() * 10000));
  const bob = alice + 1n;
  const migrationOwner = alice + 2n;
  let prisma: PrismaService;
  let vault: SecretVault;
  let providers: LlmProviderService;
  let mcp: McpService;
  let providerId: bigint;
  let mcpId: bigint;
  beforeAll(async () => {
    const db = new URL(process.env.DATABASE_URL || '');
    if (
      process.env.NODE_ENV !== 'test' ||
      db.hostname !== '127.0.0.1' ||
      db.port !== '15432' ||
      db.pathname !== '/nexus_test'
    )
      throw new Error(
        'BLOCKED: secrets tests require isolated local nexus_test',
      );
    configure();
    vault = new SecretVault();
    prisma = new PrismaService();
    await prisma.$connect();
    providers = new LlmProviderService(prisma, vault);
    mcp = new McpService(prisma, vault);
    const provider = await providers.create(
      {
        platformName: marker,
        llmNames: ['embedding-test'],
        llmAPIKey: 'fixture-provider-key',
      },
      alice.toString(),
    );
    providerId = BigInt(provider.id);
    const connection = await mcp.create(
      {
        name: marker,
        env: { ACCESS_TOKEN: 'fixture-env-secret' },
        headers: { Authorization: 'Bearer fixture-header-secret' },
      },
      alice.toString(),
    );
    mcpId = BigInt(connection.id);
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (prisma) {
      await prisma.flowLLMProviderEntity.deleteMany({
        where: { ownerUserId: { in: [alice, bob, migrationOwner] } },
      });
      await prisma.mcpServerEntity.deleteMany({
        where: { ownerUserId: { in: [alice, bob, migrationOwner] } },
      });
      await prisma.$disconnect();
    }
    restore();
  });
  it('persists provider ciphertext, masks both aliases, decrypts only internal owner lookup', async () => {
    const row = await prisma.flowLLMProviderEntity.findUniqueOrThrow({
      where: { id: providerId },
    });
    expect(row.llmAPIKey).not.toContain('fixture-provider-key');
    expect(
      vault.open(
        row.llmAPIKey,
        connectionSecretContext('provider', providerId, alice, 'apiKey'),
      ),
    ).toBe('fixture-provider-key');
    const safe = await providers.getById(providerId, alice.toString());
    expect(safe?.llmAPIKey).toBe('****');
    expect(safe?.llmapiKey).toBe('****');
    expect(
      JSON.stringify(await providers.getList(undefined, alice.toString())),
    ).not.toContain(row.llmAPIKey);
    expect(
      (await providers.getSecretById(providerId, alice.toString()))?.llmAPIKey,
    ).toBe('fixture-provider-key');
  });
  it('prevents includeSecret options from bypassing public getById masking', async () => {
    const accessor = providers.getById.bind(providers) as (
      id: bigint,
      owner: string,
      options?: { includeSecret?: boolean },
    ) => ReturnType<LlmProviderService['getById']>;
    expect(
      (await accessor(providerId, alice.toString(), { includeSecret: true }))
        ?.llmAPIKey,
    ).toBe('****');
  });
  it('denies foreign owner access and unspecified-owner provider discovery', async () => {
    expect(await providers.getById(providerId, bob.toString())).toBeNull();
    expect(
      await providers.getSecretById(providerId, bob.toString()),
    ).toBeNull();
    expect(await providers.getList(undefined, bob.toString())).toEqual([]);
    expect(
      await providers.findProviderByModelName('embedding-test'),
    ).toBeNull();
    expect(
      await providers.findProviderForEmbedding('embedding-test'),
    ).toBeNull();
    await expect(providers.getAll()).rejects.toThrow();
    expect(
      await providers.findProviderByModelName('embedding-test', bob.toString()),
    ).toBeNull();
  });
  it('update masks retain old key and a replacement is encrypted; foreign update denied', async () => {
    const before = await prisma.flowLLMProviderEntity.findUniqueOrThrow({
      where: { id: providerId },
    });
    await providers.update(
      { id: providerId.toString(), llmAPIKey: '****' },
      alice.toString(),
    );
    expect(
      (
        await prisma.flowLLMProviderEntity.findUniqueOrThrow({
          where: { id: providerId },
        })
      ).llmAPIKey,
    ).toBe(before.llmAPIKey);
    expect(
      await providers.update(
        { id: providerId.toString(), llmAPIKey: 'stolen' },
        bob.toString(),
      ),
    ).toBeNull();
    const safe = await providers.update(
      { id: providerId.toString(), llmAPIKey: 'replacement-key' },
      alice.toString(),
    );
    expect(safe?.llmAPIKey).toBe('****');
    expect(
      (await providers.getSecretById(providerId, alice.toString()))?.llmAPIKey,
    ).toBe('replacement-key');
    expect(
      (
        await prisma.flowLLMProviderEntity.findUniqueOrThrow({
          where: { id: providerId },
        })
      ).llmAPIKey,
    ).not.toContain('replacement-key');
  });
  it('persists whole MCP objects encrypted and exposes only field names with masks', async () => {
    const row = await prisma.mcpServerEntity.findUniqueOrThrow({
      where: { id: mcpId },
    });
    expect(vault.isSealed(row.env)).toBe(true);
    expect(vault.isSealed(row.headers)).toBe(true);
    expect(row.env).not.toContain('ACCESS_TOKEN');
    expect(row.headers).not.toContain('Authorization');
    const safe = (await mcp.getList(alice.toString()))[0];
    expect(safe.env).toEqual({ ACCESS_TOKEN: '****' });
    expect(safe.headers).toEqual({ Authorization: '****' });
    const internal = await mcp.getSecretById(mcpId, alice.toString());
    expect(internal?.env).toEqual({ ACCESS_TOKEN: 'fixture-env-secret' });
    expect(internal?.headers).toEqual({
      Authorization: 'Bearer fixture-header-secret',
    });
    expect(await mcp.getSecretById(mcpId, bob.toString())).toBeNull();
    expect(await mcp.getList(bob.toString())).toEqual([]);
  });
  it('refuses copying another resource ciphertext despite identical owner', async () => {
    const copyId = alice + 100n;
    const source = await prisma.flowLLMProviderEntity.findUniqueOrThrow({
      where: { id: providerId },
    });
    await prisma.flowLLMProviderEntity.create({
      data: {
        id: copyId,
        ownerUserId: alice,
        platformName: marker + '-copied',
        llmNames: '[]',
        llmAPIUrl: '',
        llmAPIKey: source.llmAPIKey,
      },
    });
    await expect(
      providers.getSecretById(copyId, alice.toString()),
    ).rejects.toThrow('CONNECTION_SECRET_UNAVAILABLE');
    await prisma.flowLLMProviderEntity.delete({ where: { id: copyId } });
  });
  it('dry run writes nothing, explicit migration preserves identity, second run does not rewrap', async () => {
    const oldProvider = alice + 101n;
    const oldMcp = alice + 102n;
    await prisma.flowLLMProviderEntity.create({
      data: {
        id: oldProvider,
        ownerUserId: migrationOwner,
        platformName: marker + '-legacy',
        llmNames: '[]',
        llmAPIUrl: '',
        llmAPIKey: 'legacy-provider-key',
      },
    });
    await prisma.mcpServerEntity.create({
      data: {
        id: oldMcp,
        ownerUserId: migrationOwner,
        name: marker + '-legacy',
        env: JSON.stringify({ TOKEN: 'legacy-env' }),
        headers: JSON.stringify({ Auth: 'legacy-header' }),
      },
    });
    const beforeProvider = await prisma.flowLLMProviderEntity.findUniqueOrThrow(
      { where: { id: oldProvider } },
    );
    const beforeMcp = await prisma.mcpServerEntity.findUniqueOrThrow({
      where: { id: oldMcp },
    });
    const dry = await migrateConnectionSecrets(prisma, vault, {
      ownerUserId: migrationOwner,
      batchSize: 1,
    });
    expect(dry).toMatchObject({
      dryRun: true,
      scanned: 2,
      pending: 2,
      migrated: 0,
      conflicts: 0,
    });
    expect(
      await prisma.flowLLMProviderEntity.findUniqueOrThrow({
        where: { id: oldProvider },
      }),
    ).toEqual(beforeProvider);
    expect(
      await prisma.mcpServerEntity.findUniqueOrThrow({ where: { id: oldMcp } }),
    ).toEqual(beforeMcp);
    const migrated = await migrateConnectionSecrets(prisma, vault, {
      ownerUserId: migrationOwner,
      dryRun: false,
      batchSize: 1,
    });
    expect(migrated).toMatchObject({ migrated: 2, conflicts: 0 });
    expect(migrated.ciphertextSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(migrated)).not.toMatch(/legacy-|nexus-secret:/);
    const afterProvider = await prisma.flowLLMProviderEntity.findUniqueOrThrow({
      where: { id: oldProvider },
    });
    const afterMcp = await prisma.mcpServerEntity.findUniqueOrThrow({
      where: { id: oldMcp },
    });
    expect(afterProvider.id).toBe(beforeProvider.id);
    expect(afterProvider.ownerUserId).toBe(beforeProvider.ownerUserId);
    expect(afterMcp.ownerUserId).toBe(beforeMcp.ownerUserId);
    expect(
      (await providers.getSecretById(oldProvider, migrationOwner.toString()))
        ?.llmAPIKey,
    ).toBe('legacy-provider-key');
    expect(
      (await mcp.getSecretById(oldMcp, migrationOwner.toString()))?.headers,
    ).toEqual({ Auth: 'legacy-header' });
    const again = await migrateConnectionSecrets(prisma, vault, {
      ownerUserId: migrationOwner,
      dryRun: false,
    });
    expect(again).toMatchObject({ migrated: 0, pending: 0, unchanged: 2 });
    expect(again.ciphertextSha256).toBe(migrated.ciphertextSha256);
    expect(
      await prisma.flowLLMProviderEntity.findUniqueOrThrow({
        where: { id: oldProvider },
      }),
    ).toEqual(afterProvider);
    expect(
      await prisma.mcpServerEntity.findUniqueOrThrow({ where: { id: oldMcp } }),
    ).toEqual(afterMcp);
  });
  it('migration fails closed on corrupted envelope instead of double wrapping', async () => {
    const corruptId = alice + 103n;
    await prisma.flowLLMProviderEntity.create({
      data: {
        id: corruptId,
        ownerUserId: bob,
        platformName: marker + '-corrupt',
        llmNames: '[]',
        llmAPIUrl: '',
        llmAPIKey: 'nexus-secret:v1:corrupt',
      },
    });
    await expect(
      migrateConnectionSecrets(prisma, vault, {
        ownerUserId: bob,
        dryRun: false,
      }),
    ).rejects.toThrow('CONNECTION_SECRET_UNAVAILABLE');
    expect(
      (
        await prisma.flowLLMProviderEntity.findUniqueOrThrow({
          where: { id: corruptId },
        })
      ).llmAPIKey,
    ).toBe('nexus-secret:v1:corrupt');
    await prisma.flowLLMProviderEntity.delete({ where: { id: corruptId } });
  });
  it('migration CAS does not overwrite a concurrent changed provider key', async () => {
    const raceId = alice + 104n;
    await prisma.flowLLMProviderEntity.create({
      data: {
        id: raceId,
        ownerUserId: bob,
        platformName: marker + '-race',
        llmNames: '[]',
        llmAPIUrl: '',
        llmAPIKey: 'before-race',
      },
    });
    // This seam needs only awaited full rows, not PrismaPromise's transaction API.
    // The adapter references the real delegate: the snapshot and concurrent write
    // still execute on PostgreSQL, while Jest can return a standard Promise.
    const delegate: {
      findMany(
        args?: Prisma.FlowLLMProviderEntityFindManyArgs,
      ): Promise<FlowLLMProviderEntity[]>;
    } = prisma.flowLLMProviderEntity;
    const original = delegate.findMany.bind(delegate);
    const spy = jest
      .spyOn(delegate, 'findMany')
      .mockImplementationOnce(async (args) => {
        const snapshot = await original(args);
        await prisma.flowLLMProviderEntity.update({
          where: { id: raceId },
          data: { llmAPIKey: 'concurrent-new-key' },
        });
        return snapshot;
      });
    try {
      const result = await migrateConnectionSecrets(prisma, vault, {
        ownerUserId: bob,
        dryRun: false,
      });
      expect(result).toMatchObject({ migrated: 0, pending: 1, conflicts: 1 });
      expect(
        (
          await prisma.flowLLMProviderEntity.findUniqueOrThrow({
            where: { id: raceId },
          })
        ).llmAPIKey,
      ).toBe('concurrent-new-key');
    } finally {
      spy.mockRestore();
      await prisma.flowLLMProviderEntity.delete({ where: { id: raceId } });
    }
  });
  it('rejects invalid MCP secret objects before persisting', async () => {
    const input = {
      name: marker + '-invalid',
      env: { TOKEN: 7 },
    } as unknown as Parameters<McpService['create']>[0];
    await expect(mcp.create(input, bob.toString())).rejects.toThrow();
    expect(
      await prisma.mcpServerEntity.count({
        where: { ownerUserId: bob, name: input.name },
      }),
    ).toBe(0);
  });
  it('migration rejects malformed legacy MCP objects without changing them', async () => {
    const badId = alice + 105n;
    await prisma.mcpServerEntity.create({
      data: {
        id: badId,
        ownerUserId: bob,
        name: marker + '-invalid-legacy',
        env: JSON.stringify({ TOKEN: 7 }),
      },
    });
    try {
      await expect(
        migrateConnectionSecrets(prisma, vault, {
          ownerUserId: bob,
          dryRun: false,
        }),
      ).rejects.toThrow('INVALID_CONNECTION_SECRET_OBJECT');
      expect(
        (
          await prisma.mcpServerEntity.findUniqueOrThrow({
            where: { id: badId },
          })
        ).env,
      ).toBe(JSON.stringify({ TOKEN: 7 }));
    } finally {
      await prisma.mcpServerEntity.delete({ where: { id: badId } });
    }
  });
  it('MCP migration CAS protects a concurrent changed header', async () => {
    const raceId = alice + 106n;
    await prisma.mcpServerEntity.create({
      data: {
        id: raceId,
        ownerUserId: bob,
        name: marker + '-mcp-race',
        env: JSON.stringify({ TOKEN: 'original' }),
        headers: JSON.stringify({ Auth: 'original' }),
      },
    });
    const delegate: {
      findMany(
        args?: Prisma.McpServerEntityFindManyArgs,
      ): Promise<McpServerEntity[]>;
    } = prisma.mcpServerEntity;
    const original = delegate.findMany.bind(delegate);
    const spy = jest
      .spyOn(delegate, 'findMany')
      .mockImplementationOnce(async (args) => {
        const snapshot = await original(args);
        await prisma.mcpServerEntity.update({
          where: { id: raceId },
          data: { headers: JSON.stringify({ Auth: 'concurrent' }) },
        });
        return snapshot;
      });
    try {
      const result = await migrateConnectionSecrets(prisma, vault, {
        ownerUserId: bob,
        dryRun: false,
      });
      expect(result).toMatchObject({ migrated: 0, conflicts: 1 });
      const row = await prisma.mcpServerEntity.findUniqueOrThrow({
        where: { id: raceId },
      });
      expect(row.env).toBe(JSON.stringify({ TOKEN: 'original' }));
      expect(row.headers).toBe(JSON.stringify({ Auth: 'concurrent' }));
    } finally {
      spy.mockRestore();
      await prisma.mcpServerEntity.delete({ where: { id: raceId } });
    }
  });
  it.each([0, -1, 1001, 1.5])(
    'rejects invalid migration batch %s',
    async (batchSize) => {
      await expect(
        migrateConnectionSecrets(prisma, vault, {
          ownerUserId: bob,
          batchSize,
        }),
      ).rejects.toThrow('INVALID_SECRET_MIGRATION_BATCH');
    },
  );
});
