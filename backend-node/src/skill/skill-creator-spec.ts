/**
 * Skill Creator 契约（工程化版本）
 *
 * 来源：~/.codex/skills/.system/skill-creator/SKILL.md + scripts/quick_validate.py
 *
 * 设计目的：
 * NEXUS 后端是单次无状态 LLM 调用，无法像真正的 Agent 那样多轮加载文件、
 * 调用 init_skill.py / quick_validate.py 等脚本。这里把 skill-creator
 * 的核心产出契约（frontmatter、命名、描述、结构、禁用文件名、渐进式披露
 * 原则）沉淀为常量与正则，注入到 LLM 提示词中作为"已加载的 meta-skill 指引"，
 * 并在生成结果落库前用 validateGeneratedSkill 做同等校验。
 *
 * 当 skill-creator 协议升级，只需要更新本文件即可。
 */

export const SKILL_NAME_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SKILL_NAME_LENGTH = 64;
export const MAX_SKILL_DESCRIPTION_LENGTH = 1024;

/** SKILL.md frontmatter 允许出现的字段（与 quick_validate.py 同步） */
export const ALLOWED_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'allowed-tools',
  'metadata',
]);

/** Skill-Creator 明确禁止生成的冗余文件名（位于 skill 目录任意层级） */
export const FORBIDDEN_SKILL_FILES = new Set([
  'README.md',
  'INSTALLATION_GUIDE.md',
  'QUICK_REFERENCE.md',
  'CHANGELOG.md',
]);

/**
 * 注入给 LLM 的 system prompt：让它"扮演加载了 skill-creator 的 Codex Agent"。
 *
 * 摘自 SKILL.md 中"Skill Creation Process / Anatomy of a Skill /
 * Progressive Disclosure / Writing Guidelines"等关键章节，剪裁后保持指令性。
 */
export const SKILL_CREATOR_SYSTEM_PROMPT = `你现在扮演一个加载了 skill-creator meta-skill 的 Codex Agent。
你的任务：把一段 NEXUS 工作流"炼化"成符合 Codex Skill 规范的可复用 Agent Skill。

【Skill 是什么】
Skill = 一个自包含目录，里面是 SKILL.md（必需）+ 可选的 scripts/ references/ assets/。
它是给"另一个 AI Agent"看的操作手册，不是给人看的 README。

【Anatomy（必须严格遵守）】
1) SKILL.md 必填，结构：
   ---
   name: hyphen-case 名称（^[a-z0-9]+(?:-[a-z0-9]+)*$，<=64 字符）
   description: 一句话讲清"做什么 + 何时触发"，<=1024 字符，禁止包含 < 或 >
   ---
   # Title
   ## Overview
   ## ...（按下面 4 种结构模式之一组织）
2) frontmatter 只允许：name、description、license、allowed-tools、metadata。任何其它键都视为非法。
3) 不允许生成的冗余文件：README.md、INSTALLATION_GUIDE.md、QUICK_REFERENCE.md、CHANGELOG.md。
4) SKILL.md 主体优先放"触发条件 + 最小操作流程"，详细参考材料放 references/*.md。
5) 不要把所有内容塞进 SKILL.md；遵循 Progressive Disclosure：>500 行就要拆 references。

【4 种结构模式（任选最贴合工作流的一种或组合）】
- Workflow-Based：清晰的步骤序列（最适合 NEXUS 工作流）
- Task-Based：多个独立任务/操作
- Reference/Guidelines：标准/规范类
- Capabilities-Based：多个互相联动的能力点

【Description 写法（核心触发器，必须包含两件事）】
- 这个 skill 做什么
- 什么场景/输入/触发词应该用它
反面示例："Generate skills"（不知道何时触发）
正面示例："Process customer support tickets via the NEXUS RAG workflow. Use when a user asks
to triage support emails, classify intent, or auto-reply based on knowledge-base context."

【写作风格】
- 始终使用祈使句/不定式（imperative/infinitive form）
- 简洁是王道：每段都要为自己付出的 token 辩护
- 所有可执行步骤、判断分支都要明确，不要写"取决于上下文"这种废话

【禁止事项】
- 禁止用 Markdown 包裹 JSON 输出
- 禁止生成 README/INSTALLATION_GUIDE/QUICK_REFERENCE/CHANGELOG
- 禁止 frontmatter 出现 name/description/license/allowed-tools/metadata 之外的键
- 禁止描述里出现 < 或 >
- 禁止 skill 名称含大写、下划线、空格、中文

【输出格式（严格）】
只返回一个 JSON 对象，结构如下，不要任何 Markdown 包裹和额外解释：
{
  "name": "hyphen-case-skill-name",
  "description": "一句话说明做什么 + 何时触发",
  "inputSchema": { ... 可选，描述工作流入参 },
  "outputSchema": { ... 可选，描述工作流出参 },
  "files": {
    "SKILL.md": "---\\nname: ...\\ndescription: ...\\n---\\n# Title\\n## Overview\\n...",
    "references/workflow.md": "## 节点链路 + 字段映射 + 触发示例（可选）",
    "references/<其它必要的引用文件>.md": "..."
  }
}
files 中必须包含 SKILL.md，可以包含 references/*.md，但不要 README/INSTALLATION_GUIDE/QUICK_REFERENCE/CHANGELOG。
`;

/**
 * 校验 LLM 产出物是否符合 skill-creator 契约。
 * 等价于运行 quick_validate.py。
 */
export interface SkillValidationError {
  field: string;
  message: string;
}

export function validateGeneratedSkill(payload: {
  name?: unknown;
  description?: unknown;
  files?: Record<string, unknown>;
}): SkillValidationError[] {
  const errors: SkillValidationError[] = [];

  // ── 1. name ───────────────────────────────────
  if (typeof payload.name !== 'string' || !payload.name.trim()) {
    errors.push({ field: 'name', message: 'name 必须是非空字符串' });
  } else {
    const name = payload.name.trim();
    if (!SKILL_NAME_REGEX.test(name)) {
      errors.push({
        field: 'name',
        message: `name "${name}" 不符合 hyphen-case 规则（仅小写字母、数字、连字符，不能首尾为连字符或含连续连字符）`,
      });
    }
    if (name.length > MAX_SKILL_NAME_LENGTH) {
      errors.push({
        field: 'name',
        message: `name 长度 ${name.length} 超过最大 ${MAX_SKILL_NAME_LENGTH}`,
      });
    }
  }

  // ── 2. description ────────────────────────────
  if (typeof payload.description !== 'string') {
    errors.push({ field: 'description', message: 'description 必须是字符串' });
  } else {
    const desc = payload.description.trim();
    if (desc.length === 0) {
      errors.push({ field: 'description', message: 'description 不能为空' });
    }
    if (desc.length > MAX_SKILL_DESCRIPTION_LENGTH) {
      errors.push({
        field: 'description',
        message: `description 长度 ${desc.length} 超过最大 ${MAX_SKILL_DESCRIPTION_LENGTH}`,
      });
    }
    if (desc.includes('<') || desc.includes('>')) {
      errors.push({ field: 'description', message: 'description 不能包含 < 或 >' });
    }
  }

  // ── 3. files ──────────────────────────────────
  if (!payload.files || typeof payload.files !== 'object') {
    errors.push({ field: 'files', message: 'files 必须是对象' });
    return errors;
  }
  const skillMd = payload.files['SKILL.md'];
  if (typeof skillMd !== 'string' || !skillMd.trim()) {
    errors.push({ field: 'files["SKILL.md"]', message: 'files 必须包含非空 SKILL.md' });
    return errors;
  }

  // ── 4. SKILL.md frontmatter ───────────────────
  const fmMatch = skillMd.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    errors.push({
      field: 'files["SKILL.md"]',
      message: 'SKILL.md 必须以 YAML frontmatter（---包围）开头',
    });
  } else {
    const frontmatter = fmMatch[1];
    const keys = new Set<string>();
    for (const line of frontmatter.split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z][\w-]*):/);
      if (m) keys.add(m[1]);
    }
    for (const k of keys) {
      if (!ALLOWED_FRONTMATTER_KEYS.has(k)) {
        errors.push({
          field: 'files["SKILL.md"].frontmatter',
          message: `frontmatter 出现非法字段 "${k}"，仅允许：${Array.from(ALLOWED_FRONTMATTER_KEYS).join(', ')}`,
        });
      }
    }
    if (!keys.has('name')) {
      errors.push({ field: 'files["SKILL.md"].frontmatter', message: 'frontmatter 缺少 name' });
    }
    if (!keys.has('description')) {
      errors.push({
        field: 'files["SKILL.md"].frontmatter',
        message: 'frontmatter 缺少 description',
      });
    }
  }

  // ── 5. 禁用文件名 ─────────────────────────────
  for (const path of Object.keys(payload.files)) {
    const baseName = path.split('/').pop() || '';
    if (FORBIDDEN_SKILL_FILES.has(baseName)) {
      errors.push({
        field: `files["${path}"]`,
        message: `禁止生成 ${baseName}（skill-creator 规范禁用 README/INSTALLATION_GUIDE/QUICK_REFERENCE/CHANGELOG）`,
      });
    }
  }

  return errors;
}
