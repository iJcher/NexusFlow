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

@Injectable()
export class SkillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llmProviderService: LlmProviderService,
  ) {}

  async generateFromFlow(
    flowId: bigint,
    userId: string,
    dto: { name?: string; description?: string; modelName?: string; inputSchema?: unknown; outputSchema?: unknown },
  ) {
    const ownerUserId = BigInt(userId);
    const flow = await this.prisma.flowEntity.findFirst({ where: { id: flowId, ownerUserId } });
    if (!flow) return null;

    const modelName = dto.modelName || process.env.SKILL_GENERATION_MODEL || '';
    if (!modelName) {
      throw new Error('Skill generation model is not configured. Set SKILL_GENERATION_MODEL or pass modelName.');
    }

    const provider = await this.llmProviderService.findProviderByModelName(modelName, userId);
    if (!provider) {
      throw new Error(`No provider found for skill generation model: ${modelName}`);
    }

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

    const generated = await this.callSkillModel(provider, modelName, generationPrompt);

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
        modelName,
      },
    });

    return this.toDto(skill);
  }

  async publishFromFlow(
    flowId: bigint,
    userId: string,
    dto: { name?: string; description?: string; inputSchema?: unknown; outputSchema?: unknown; modelName?: string },
  ) {
    return this.generateFromFlow(flowId, userId, dto);
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

  private async callSkillModel(provider: any, modelName: string, prompt: string): Promise<GeneratedSkillPayload> {
    const response = await fetch(provider.llmAPIUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.llmAPIKey}`,
      },
      body: JSON.stringify({
        model: modelName,
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
