import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';
import { LlmProviderService } from '../llm-provider/llm-provider.service';

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

  private buildSkillPrompt(input: {
    requestedName: string;
    requestedDescription: string;
    workflowSnapshot: unknown;
    inputSchema: unknown;
    outputSchema: unknown;
  }) {
    return `你是 NEXUS 后端固定的 Skill 生成器，请严格依据 Codex skill-creator 规范，把一个 NEXUS 工作流炼化成可复用 Agent Skill。

生成要求：
1. 只返回 JSON，不要 Markdown 包裹，不要额外解释。
2. JSON 结构必须是：
{
  "name": "lowercase-hyphen-skill-name",
  "description": "一句话说明这个 Skill 做什么以及什么时候使用",
  "inputSchema": {},
  "outputSchema": {},
  "files": {
    "SKILL.md": "---\\nname: ...\\ndescription: ...\\n---\\n# ...",
    "references/workflow.md": "...",
    "references/node-map.md": "..."
  }
}
3. files 必须包含 SKILL.md。
4. SKILL.md 只放核心触发条件和最小操作流程；详细节点说明放 references/workflow.md。
5. skill 名称只能包含小写字母、数字、连字符，长度不超过 64。
6. 不要生成 README、INSTALLATION_GUIDE、CHANGELOG 等冗余文件。

用户期望 Skill 名称：${input.requestedName}
用户描述：${input.requestedDescription}
输入 Schema：${JSON.stringify(input.inputSchema)}
输出 Schema：${JSON.stringify(input.outputSchema)}
工作流快照：
${JSON.stringify(input.workflowSnapshot, null, 2)}
`;
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
        messages: [
          { role: 'system', content: '你是严格输出 JSON 的工程化 Skill 生成器。' },
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
    if (!parsed.files?.['SKILL.md']) {
      throw new Error('Generated skill is invalid: missing SKILL.md');
    }
    return parsed;
  }

  private parseJsonFromModel(content: string): GeneratedSkillPayload {
    const trimmed = content.trim();
    const jsonText = trimmed.startsWith('```')
      ? trimmed.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
      : trimmed;
    return JSON.parse(jsonText) as GeneratedSkillPayload;
  }
}
