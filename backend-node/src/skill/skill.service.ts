import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';
import { LlmProviderService } from '../llm-provider/llm-provider.service';
import {
  SKILL_CREATOR_SYSTEM_PROMPT,
  validateGeneratedSkill,
} from './skill-creator-spec';

interface GeneratedSkillPayload {
  name: string;
  description: string;
  files: Record<string, string>;
  inputSchema?: unknown;
  outputSchema?: unknown;
}

export const SKILL_DEFAULT_MODEL_KEY = 'system:default';

export interface SkillModelOption {
  key: string;
  label: string;
  modelName: string;
  isDefault: boolean;
  source: 'system' | 'user';
}

interface ResolvedSkillProvider {
  modelName: string;
  llmAPIUrl: string;
  llmAPIKey: string;
}

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmProviderService: LlmProviderService,
  ) {}

  /**
   * 返回当前用户在"生成 Skill"弹窗里可选的模型列表。
   *
   * 顺序：
   * 1. 系统默认免费模型（由后端 .env 中的 SKILL_DEFAULT_* 提供，所有用户共享）
   * 2. 用户自己 LLM Provider 配置里的所有模型，按 provider 顺序展开
   */
  async getAvailableModels(userId: string): Promise<SkillModelOption[]> {
    const options: SkillModelOption[] = [];

    const defaultProvider = this.llmProviderService.getDefaultSkillProvider();
    if (defaultProvider) {
      options.push({
        key: SKILL_DEFAULT_MODEL_KEY,
        label: defaultProvider.displayName,
        modelName: defaultProvider.modelName,
        isDefault: true,
        source: 'system',
      });
    }

    const userProviders = await this.llmProviderService.getAll(userId);
    for (const provider of userProviders) {
      const names: string[] = Array.isArray(provider.llmNames) ? provider.llmNames : [];
      for (const modelName of names) {
        if (!modelName) continue;
        options.push({
          key: `user:${provider.id}:${modelName}`,
          label: `${provider.platformName} · ${modelName}`,
          modelName,
          isDefault: false,
          source: 'user',
        });
      }
    }

    return options;
  }

  async generateFromFlow(
    flowId: bigint,
    userId: string,
    dto: {
      name?: string;
      description?: string;
      modelKey?: string;
      modelName?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
    },
  ) {
    const ownerUserId = BigInt(userId);
    const flow = await this.prisma.flowEntity.findFirst({ where: { id: flowId, ownerUserId } });
    if (!flow) return null;

    const resolved = await this.resolveProvider(dto.modelKey, dto.modelName, userId);

    const workflowSnapshot = {
      flowId: flow.id.toString(),
      displayName: flow.displayName,
      description: flow.description,
      configInfoForRun: flow.configInfoForRun ? JSON.parse(flow.configInfoForRun) : null,
      configInfoForWeb: flow.configInfoForWeb,
    };

    const generationPrompt = this.buildSkillPrompt({
      requestedName: dto.name || flow.displayName,
      requestedDescription: dto.description || flow.description || '',
      workflowSnapshot,
      inputSchema: dto.inputSchema || {},
      outputSchema: dto.outputSchema || {},
    });

    const generated = await this.callSkillModel(resolved, generationPrompt);

    const skill = await this.prisma.skillEntity.create({
      data: {
        id: nextId(),
        ownerUserId,
        flowId,
        name: generated.name || dto.name || flow.displayName,
        description: generated.description || dto.description || flow.description || '',
        inputSchema: JSON.stringify(generated.inputSchema || dto.inputSchema || {}),
        outputSchema: JSON.stringify(generated.outputSchema || dto.outputSchema || {}),
        workflowSnapshot: JSON.stringify(workflowSnapshot),
        filesJson: JSON.stringify(generated.files),
        generationPrompt,
        modelName: resolved.modelName,
      },
    });

    return this.toDto(skill);
  }

  async publishFromFlow(
    flowId: bigint,
    userId: string,
    dto: {
      name?: string;
      description?: string;
      inputSchema?: unknown;
      outputSchema?: unknown;
      modelKey?: string;
      modelName?: string;
    },
  ) {
    return this.generateFromFlow(flowId, userId, dto);
  }

  /**
   * 把前端传入的 modelKey / modelName 解析成最终调用参数。
   *
   * 路由规则：
   * - 显式传入 system:default → 用环境变量里的免费模型
   * - 传入用户模型名 → 用 LlmProviderService 在该用户的 provider 中查找
   * - 都没传 → 优先走系统默认，否则回退到 SKILL_GENERATION_MODEL 兼容老逻辑
   */
  private async resolveProvider(
    modelKey: string | undefined,
    modelName: string | undefined,
    userId: string,
  ): Promise<ResolvedSkillProvider> {
    const useSystemDefault =
      modelKey === SKILL_DEFAULT_MODEL_KEY || (!modelKey && !modelName);

    if (useSystemDefault) {
      const defaultProvider = this.llmProviderService.getDefaultSkillProvider();
      if (defaultProvider) return defaultProvider;
      if (useSystemDefault && !modelName) {
        const fallbackModel = process.env.SKILL_GENERATION_MODEL || '';
        if (!fallbackModel) {
          throw new Error(
            'Skill generation default model not configured. Set SKILL_DEFAULT_MODEL_NAME / SKILL_DEFAULT_API_URL / SKILL_DEFAULT_API_KEY in backend .env, or select a user model.',
          );
        }
        modelName = fallbackModel;
      }
    }

    const finalModelName = modelName || '';
    if (!finalModelName) {
      throw new Error('No model selected for skill generation.');
    }

    const provider = await this.llmProviderService.findProviderByModelName(finalModelName, userId);
    if (!provider) {
      throw new Error(`No provider found for skill generation model: ${finalModelName}`);
    }

    return {
      modelName: finalModelName,
      llmAPIUrl: provider.llmAPIUrl,
      llmAPIKey: provider.llmAPIKey,
    };
  }

  async getList(userId: string) {
    const skills = await this.prisma.skillEntity.findMany({
      where: { ownerUserId: BigInt(userId), status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    return skills.map((skill) => this.toDto(skill));
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.skillEntity.updateMany({
      where: { id, ownerUserId: BigInt(userId) },
      data: { status: 'deleted' },
    });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId.toString(),
      flowId: entity.flowId.toString(),
      name: entity.name,
      description: entity.description,
      version: entity.version,
      inputSchema: JSON.parse(entity.inputSchema || '{}'),
      outputSchema: JSON.parse(entity.outputSchema || '{}'),
      files: JSON.parse(entity.filesJson || '{}'),
      modelName: entity.modelName,
      status: entity.status,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  /**
   * 构造 user prompt：把 workflow 数据+用户期望传给 LLM。
   * skill-creator 的"指导手册"放在 system prompt 里（SKILL_CREATOR_SYSTEM_PROMPT），
   * 模拟 Agent 在加载 meta-skill 后的两阶段上下文：
   *   system = "你是加载了 skill-creator 的 Agent" + 完整契约
   *   user   = "现在请把这个工作流转成 skill"
   */
  private buildSkillPrompt(input: {
    requestedName: string;
    requestedDescription: string;
    workflowSnapshot: unknown;
    inputSchema: unknown;
    outputSchema: unknown;
  }) {
    return `请按 skill-creator 规范，把以下 NEXUS 工作流炼化成一个可复用 Skill。

# 用户输入
- 期望 skill 名称：${input.requestedName}
- 期望 skill 描述：${input.requestedDescription || '（用户未提供，请基于工作流自行总结一句话，包含 WHEN to use）'}

# 工作流入参 Schema
${JSON.stringify(input.inputSchema, null, 2)}

# 工作流出参 Schema
${JSON.stringify(input.outputSchema, null, 2)}

# 工作流完整快照（节点链路、字段映射、配置）
${JSON.stringify(input.workflowSnapshot, null, 2)}

# 你需要做的
1. 阅读上述工作流，理解它是做什么的，以及"用户在什么场景下会触发它"。
2. 选择最合适的结构模式（NEXUS 工作流通常是 Workflow-Based）。
3. 产出 SKILL.md：
   - frontmatter.name = lowercase hyphen-case，可适当规范化用户输入
   - frontmatter.description = "做什么 + WHEN to use"，必须明确触发场景，不要含 < 或 >
   - body 顺序：## Overview → ## Trigger Conditions → ## Workflow Steps → ## Inputs / Outputs → ## Notes
   - body 内容必须基于"工作流快照"中的真实节点，不要编造不存在的节点
4. 如果工作流复杂（>4 个节点 或 含分支/循环），把节点级别的细节拆到 references/workflow.md，SKILL.md 只放高层概览。
5. 严格按 system 中要求的 JSON 格式返回，不要任何 Markdown 包裹。`;
  }

  private async callSkillModel(
    provider: ResolvedSkillProvider,
    prompt: string,
  ): Promise<GeneratedSkillPayload> {
    const response = await fetch(provider.llmAPIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.llmAPIKey}`,
      },
      body: JSON.stringify({
        model: provider.modelName,
        stream: false,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SKILL_CREATOR_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Skill generation model failed ${response.status}: ${errorText}`);
    }

    const result: any = await response.json();
    const content = result.choices?.[0]?.message?.content || '';
    const parsed = this.parseJsonFromModel(content);

    const violations = validateGeneratedSkill(parsed);
    if (violations.length > 0) {
      const summary = violations.map((v) => `[${v.field}] ${v.message}`).join('\n  - ');
      throw new Error(
        `Generated skill failed skill-creator validation:\n  - ${summary}\n请重新生成（必要时换更强的模型）。`,
      );
    }

    return parsed;
  }

  /**
   * 兼容某些模型即使设置了 response_format=json_object 仍会返回带 ```json``` 包裹的情况。
   * 也容忍模型在 JSON 前后多出几行 reasoning 文本，会取最外层第一个 { 到最后一个 } 之间的内容。
   */
  private parseJsonFromModel(content: string): GeneratedSkillPayload {
    let trimmed = content.trim();
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace > 0 || (lastBrace !== -1 && lastBrace < trimmed.length - 1)) {
      trimmed = trimmed.slice(firstBrace, lastBrace + 1);
    }
    try {
      return JSON.parse(trimmed) as GeneratedSkillPayload;
    } catch (e) {
      throw new Error(
        `Failed to parse skill model output as JSON. First 200 chars:\n${content.slice(0, 200)}`,
      );
    }
  }
}
