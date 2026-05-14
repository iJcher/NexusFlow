/**
 * 批量灌 RAG 文档到 NEXUS 知识库
 *
 * 用法：
 *   pnpm seed:rag -- \
 *     --api-url http://localhost:3000 \
 *     --phone 13800138000 \
 *     --password 123456 \
 *     --kb "spec-library" \
 *     --dir ../rag-seeds/vue-docs/src \
 *     --dir ../rag-seeds/nuxt-repo/docs
 *
 * 行为：
 *   1. 登录拿 JWT
 *   2. ensure 指定 KB（不存在就创建）
 *   3. 拉一遍该 KB 下已有文档，做幂等去重（按 fileName）
 *   4. 递归扫描传入目录里所有 .md，逐个上传
 *   5. 进度 + 失败重试一次 + 末尾汇总
 *
 * 设计取舍：
 *   - 不引入新依赖，全部用 Node 22+ 内置（fetch/FormData/Blob/parseArgs/fs.readdir recursive）
 *   - 串行上传，避免并发把后端 chunking + embedding 队列打爆
 *   - 失败只重试一次：减少卡顿，剩下的留给人工补
 */

import { parseArgs } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, basename, extname, relative } from 'node:path';

interface Args {
  apiUrl: string;
  phone: string;
  password: string;
  kb: string;
  dirs: string[];
  chunkSize?: number;
  chunkOverlap?: number;
}

interface JsonResp<T = unknown> {
  errCode: number;
  errMsg?: string;
  data?: T;
}

interface AuthData {
  accessToken: string;
}

interface KbDoc {
  id: string;
  fileName: string;
}

interface Kb {
  id: string;
  name: string;
}

function parseCli(): Args {
  const { values } = parseArgs({
    options: {
      'api-url': { type: 'string' },
      phone: { type: 'string' },
      password: { type: 'string' },
      kb: { type: 'string' },
      dir: { type: 'string', multiple: true },
      'chunk-size': { type: 'string' },
      'chunk-overlap': { type: 'string' },
    },
    strict: true,
  });

  const required = ['api-url', 'phone', 'password', 'kb'] as const;
  for (const key of required) {
    if (!values[key]) {
      console.error(`[ERR] 缺少参数 --${key}`);
      process.exit(1);
    }
  }
  if (!values.dir || values.dir.length === 0) {
    console.error('[ERR] 至少要传一个 --dir');
    process.exit(1);
  }

  return {
    apiUrl: (values['api-url'] as string).replace(/\/+$/, ''),
    phone: values.phone as string,
    password: values.password as string,
    kb: values.kb as string,
    dirs: values.dir as string[],
    chunkSize: values['chunk-size'] ? Number(values['chunk-size']) : undefined,
    chunkOverlap: values['chunk-overlap'] ? Number(values['chunk-overlap']) : undefined,
  };
}

class NexusClient {
  private token = '';
  constructor(private apiUrl: string) {}

  async login(phone: string, password: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/UserAccount/RegistOrLogin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone, password }),
    });
    const json = (await res.json()) as JsonResp<AuthData>;
    if (json.errCode !== 0 || !json.data?.accessToken) {
      throw new Error(`登录失败: ${json.errMsg || res.status}`);
    }
    this.token = json.data.accessToken;
  }

  private auth(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async ensureKb(name: string): Promise<Kb> {
    const listRes = await fetch(`${this.apiUrl}/Knowledge/GetList?pageSize=200`, {
      headers: this.auth(),
    });
    const listJson = (await listRes.json()) as JsonResp<{ items: Kb[] }>;
    const found = listJson.data?.items?.find((k) => k.name === name);
    if (found) {
      console.log(`[INFO] 命中已有知识库 "${name}" (id=${found.id})`);
      return found;
    }

    const createRes = await fetch(`${this.apiUrl}/Knowledge/Create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.auth() },
      body: JSON.stringify({
        name,
        description: `Seeded by seed-rag.ts at ${new Date().toISOString()}`,
      }),
    });
    const createJson = (await createRes.json()) as JsonResp<Kb>;
    if (createJson.errCode !== 0 || !createJson.data) {
      throw new Error(`创建知识库失败: ${createJson.errMsg}`);
    }
    console.log(`[INFO] 新建知识库 "${name}" (id=${createJson.data.id})`);
    return createJson.data;
  }

  async listDocs(kbId: string): Promise<KbDoc[]> {
    const res = await fetch(`${this.apiUrl}/Knowledge/GetById?id=${kbId}`, {
      headers: this.auth(),
    });
    const json = (await res.json()) as JsonResp<{ documents?: KbDoc[] }>;
    return json.data?.documents || [];
  }

  async uploadDoc(
    kbId: string,
    fileName: string,
    buffer: Buffer,
    chunkSize?: number,
    chunkOverlap?: number,
  ): Promise<void> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), fileName);

    const params = new URLSearchParams({ knowledgeBaseId: kbId });
    if (chunkSize) params.set('chunkSize', String(chunkSize));
    if (chunkOverlap) params.set('chunkOverlap', String(chunkOverlap));

    const res = await fetch(`${this.apiUrl}/Knowledge/UploadDocument?${params}`, {
      method: 'POST',
      headers: this.auth(),
      body: form,
    });
    const json = (await res.json()) as JsonResp;
    if (json.errCode !== 0) {
      throw new Error(json.errMsg || `HTTP ${res.status}`);
    }
  }
}

/**
 * 递归收集目录下所有 .md
 * 排除 node_modules / .git / dist 等噪音目录
 */
async function collectMarkdowns(rootDirs: string[]): Promise<string[]> {
  const EXCLUDE = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output']);
  const result: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (EXCLUDE.has(entry)) continue;
      const full = join(dir, entry);
      const st = await stat(full);
      if (st.isDirectory()) {
        await walk(full);
      } else if (extname(entry).toLowerCase() === '.md') {
        result.push(full);
      }
    }
  }

  for (const d of rootDirs) {
    const abs = resolve(d);
    await walk(abs);
  }
  return result;
}

/**
 * 给 markdown 起一个稳定可读的文件名，便于排查 + 幂等去重。
 * 例：D:\NEXUS\rag-seeds\vue-docs\src\guide\composition-api.md
 *  → vue-docs__src__guide__composition-api.md
 */
function makeStableFileName(absPath: string): string {
  const segs = absPath.replace(/\\/g, '/').split('/');
  const idx = segs.findIndex((s) => s === 'rag-seeds');
  const tail = idx >= 0 ? segs.slice(idx + 1) : segs.slice(-3);
  return tail.join('__');
}

async function main(): Promise<void> {
  const args = parseCli();
  const client = new NexusClient(args.apiUrl);

  console.log(`[1/4] 登录 ${args.apiUrl} as ${args.phone}`);
  await client.login(args.phone, args.password);

  console.log(`[2/4] ensure 知识库 "${args.kb}"`);
  const kb = await client.ensureKb(args.kb);

  console.log(`[3/4] 扫描目录: ${args.dirs.join(', ')}`);
  const files = await collectMarkdowns(args.dirs);
  console.log(`     → 找到 ${files.length} 个 .md 文件`);

  const existing = await client.listDocs(kb.id);
  const existingNames = new Set(existing.map((d) => d.fileName));
  console.log(`     → 已有 ${existing.length} 篇文档，将跳过同名`);

  console.log(`[4/4] 上传中（chunkSize=${args.chunkSize ?? 'default'} overlap=${args.chunkOverlap ?? 'default'}）`);

  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures: { file: string; reason: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    const abs = files[i];
    const fileName = makeStableFileName(abs);
    const tag = `[${i + 1}/${files.length}]`;

    if (existingNames.has(fileName)) {
      skipped++;
      console.log(`${tag} SKIP (already uploaded) ${fileName}`);
      continue;
    }

    const buf = await readFile(abs);
    if (buf.length === 0) {
      skipped++;
      console.log(`${tag} SKIP (empty) ${fileName}`);
      continue;
    }

    let lastErr: unknown;
    let success = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await client.uploadDoc(kb.id, fileName, buf, args.chunkSize, args.chunkOverlap);
        success = true;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt === 1) {
          console.log(`${tag} retry ${fileName} (${(e as Error).message})`);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }

    if (success) {
      ok++;
      console.log(`${tag} OK   ${fileName} (${(buf.length / 1024).toFixed(1)} KB)`);
    } else {
      failed++;
      const reason = lastErr instanceof Error ? lastErr.message : String(lastErr);
      failures.push({ file: fileName, reason });
      console.log(`${tag} FAIL ${fileName}: ${reason}`);
    }
  }

  console.log('\n=== 汇总 ===');
  console.log(`✅ 上传成功: ${ok}`);
  console.log(`⏭  跳过:    ${skipped}`);
  console.log(`❌ 失败:    ${failed}`);
  if (failures.length > 0) {
    console.log('\n失败列表（前 20 条）:');
    for (const f of failures.slice(0, 20)) {
      console.log(`  - ${f.file}: ${f.reason}`);
    }
  }

  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
