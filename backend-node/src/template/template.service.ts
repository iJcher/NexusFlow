import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextId } from '../common/snowflake';

const FLOW_TYPE_MAP: Record<string, number> = {
  LogicFlow: 0,
  AIFlow: 1,
  ApprovalFlow: 2,
};

interface OfficialTemplateDefinition {
  id: bigint;
  name: string;
  description: string;
  flowType: number;
  category: string;
  tags: string[];
  configInfoForRun: Record<string, unknown>;
  configInfoForWeb: string;
}

interface TemplateNodeDefinition {
  id: string;
  typeName: string;
  displayName: string;
  x: number;
  y: number;
  properties?: Record<string, unknown>;
}

interface TemplateEdgeDefinition {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: any, userId: string, userName: string) {
    const flowType =
      typeof dto.flowType === 'string' ? FLOW_TYPE_MAP[dto.flowType] ?? 0 : dto.flowType ?? 0;

    const entity = await this.prisma.flowTemplateEntity.create({
      data: {
        id: nextId(),
        ownerUserId: BigInt(userId),
        name: dto.name || '',
        description: dto.description || '',
        flowType,
        category: dto.category || 'custom',
        tags: dto.tags ? JSON.stringify(dto.tags) : '[]',
        configInfoForRun: dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null,
        configInfoForWeb: dto.configInfoForWeb || null,
        isOfficial: dto.isOfficial ?? false,
        createdBy: userName,
      },
    });
    this.logger.log(`Template created, ID: ${entity.id}`);
    return this.toDto(entity);
  }

  async createFromFlow(flowId: bigint, dto: any, userId: string, userName: string) {
    const flow = await this.prisma.flowEntity.findFirst({
      where: { id: flowId, ownerUserId: BigInt(userId) },
    });
    if (!flow) return null;

    return this.create(
      {
        name: dto.name || flow.displayName,
        description: dto.description || flow.description,
        flowType: flow.flowType,
        category: dto.category || 'custom',
        tags: dto.tags || [],
        configInfoForRun: flow.configInfoForRun ? JSON.parse(flow.configInfoForRun) : null,
        configInfoForWeb: flow.configInfoForWeb,
      },
      userId,
      userName,
    );
  }

  async getById(id: bigint, userId: string) {
    const entity = await this.prisma.flowTemplateEntity.findFirst({
      where: { id, OR: [{ ownerUserId: BigInt(userId) }, { isOfficial: true }] },
    });
    return entity ? this.toDto(entity) : null;
  }

  async getList(params: {
    flowType?: number;
    category?: string;
    isOfficial?: boolean;
    keyword?: string;
    pageIndex?: number;
    pageSize?: number;
  }, userId: string) {
    await this.ensureOfficialTemplates();

    const { flowType, category, isOfficial, keyword, pageIndex = 1, pageSize = 20 } = params;
    const where: any = { OR: [{ ownerUserId: BigInt(userId) }, { isOfficial: true }] };
    if (flowType !== undefined) where.flowType = flowType;
    if (category) where.category = category;
    if (isOfficial !== undefined) where.isOfficial = isOfficial;
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }

    const [total, entities] = await Promise.all([
      this.prisma.flowTemplateEntity.count({ where }),
      this.prisma.flowTemplateEntity.findMany({
        where,
        orderBy: [{ isOfficial: 'desc' }, { createdAt: 'desc' }],
        skip: (pageIndex - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      total,
      items: entities.map((e) => this.toDto(e)),
    };
  }

  async update(id: bigint, dto: any, userId: string) {
    const entity = await this.prisma.flowTemplateEntity.findFirst({
      where: { id, ownerUserId: BigInt(userId), isOfficial: false },
    });
    if (!entity) return null;

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.category !== undefined) updateData.category = dto.category;
    if (dto.tags !== undefined) updateData.tags = JSON.stringify(dto.tags);
    if (dto.configInfoForRun !== undefined)
      updateData.configInfoForRun = dto.configInfoForRun ? JSON.stringify(dto.configInfoForRun) : null;
    if (dto.configInfoForWeb !== undefined) updateData.configInfoForWeb = dto.configInfoForWeb;

    const updated = await this.prisma.flowTemplateEntity.update({
      where: { id },
      data: updateData,
    });
    return this.toDto(updated);
  }

  async delete(id: bigint, userId: string) {
    const result = await this.prisma.flowTemplateEntity.deleteMany({
      where: { id, ownerUserId: BigInt(userId), isOfficial: false },
    });
    return result.count > 0;
  }

  private toDto(entity: any) {
    return {
      id: entity.id.toString(),
      ownerUserId: entity.ownerUserId?.toString?.() ?? null,
      name: entity.name,
      description: entity.description,
      flowType: entity.flowType,
      category: entity.category,
      tags: entity.tags ? JSON.parse(entity.tags) : [],
      configInfoForRun: entity.configInfoForRun ? JSON.parse(entity.configInfoForRun) : null,
      configInfoForWeb: entity.configInfoForWeb,
      isOfficial: entity.isOfficial,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  private async ensureOfficialTemplates() {
    const templates = this.buildOfficialTemplates();
    await Promise.all(
      templates.map((template) =>
        this.prisma.flowTemplateEntity.upsert({
          where: { id: template.id },
          update: {
            name: template.name,
            description: template.description,
            flowType: template.flowType,
            category: template.category,
            tags: JSON.stringify(template.tags),
            configInfoForRun: JSON.stringify(template.configInfoForRun),
            configInfoForWeb: template.configInfoForWeb,
            isOfficial: true,
            createdBy: 'System',
          },
          create: {
            id: template.id,
            name: template.name,
            description: template.description,
            flowType: template.flowType,
            category: template.category,
            tags: JSON.stringify(template.tags),
            configInfoForRun: JSON.stringify(template.configInfoForRun),
            configInfoForWeb: template.configInfoForWeb,
            isOfficial: true,
            createdBy: 'System',
          },
        }),
      ),
    );
  }

  private buildOfficialTemplates(): OfficialTemplateDefinition[] {
    return [
      this.createTemplateDefinition({
        id: 910000000000000001n,
        name: '基础 AI 问答',
        description: 'Start -> LLM -> Reply，适合快速验证模型调用与流式回复。',
        flowType: 1,
        category: 'customer-service',
        tags: ['ai', 'chat'],
        nodes: [
          this.createStartNode('tpl_basic_start', 120, 180),
          this.createLLMNode('tpl_basic_llm', 460, 150),
          this.createReplyNode('tpl_basic_reply', 820, 180),
        ],
        edges: [
          { id: 'tpl_basic_e_start_llm', fromNodeId: 'tpl_basic_start', toNodeId: 'tpl_basic_llm' },
          { id: 'tpl_basic_e_llm_reply', fromNodeId: 'tpl_basic_llm', toNodeId: 'tpl_basic_reply' },
        ],
      }),
      this.createTemplateDefinition({
        id: 910000000000000002n,
        name: '知识库问答',
        description: 'Start -> Knowledge -> LLM -> Reply，适合基于知识库回答用户问题。',
        flowType: 1,
        category: 'rag',
        tags: ['rag', 'knowledge', 'ai'],
        nodes: [
          this.createStartNode('tpl_rag_start', 120, 180),
          this.createKnowledgeNode('tpl_rag_knowledge', 440, 150),
          this.createLLMNode('tpl_rag_llm', 780, 150),
          this.createReplyNode('tpl_rag_reply', 1140, 180),
        ],
        edges: [
          { id: 'tpl_rag_e_start_knowledge', fromNodeId: 'tpl_rag_start', toNodeId: 'tpl_rag_knowledge' },
          { id: 'tpl_rag_e_knowledge_llm', fromNodeId: 'tpl_rag_knowledge', toNodeId: 'tpl_rag_llm' },
          { id: 'tpl_rag_e_llm_reply', fromNodeId: 'tpl_rag_llm', toNodeId: 'tpl_rag_reply' },
        ],
      }),
      this.createTemplateDefinition({
        id: 910000000000000003n,
        name: 'HTTP 外部数据问答',
        description: 'Start -> HTTP -> LLM -> Reply，适合把外部接口结果交给模型总结。',
        flowType: 1,
        category: 'data',
        tags: ['http', 'api', 'ai'],
        nodes: [
          this.createStartNode('tpl_http_start', 120, 180),
          this.createHttpNode('tpl_http_request', 440, 150),
          this.createLLMNode('tpl_http_llm', 780, 150, '请结合接口返回结果回答用户问题。\n\n用户问题：{{sys.query}}\n接口结果：{{tpl_http_request.responseBody}}'),
          this.createReplyNode('tpl_http_reply', 1140, 180),
        ],
        edges: [
          { id: 'tpl_http_e_start_http', fromNodeId: 'tpl_http_start', toNodeId: 'tpl_http_request' },
          { id: 'tpl_http_e_http_llm', fromNodeId: 'tpl_http_request', toNodeId: 'tpl_http_llm' },
          { id: 'tpl_http_e_llm_reply', fromNodeId: 'tpl_http_llm', toNodeId: 'tpl_http_reply' },
        ],
      }),
    ];
  }

  private createTemplateDefinition(input: {
    id: bigint;
    name: string;
    description: string;
    flowType: number;
    category: string;
    tags: string[];
    nodes: TemplateNodeDefinition[];
    edges: TemplateEdgeDefinition[];
  }): OfficialTemplateDefinition {
    const runNodes = input.nodes.map((node) => ({
      id: node.id,
      typeName: node.typeName,
      displayName: node.displayName,
      ...(node.properties || {}),
    }));

    const lines = input.edges.map((edge) => ({
      id: edge.id,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      sourceAnchorId: `${edge.fromNodeId}_right`,
      targetAnchorId: `${edge.toNodeId}_left`,
    }));

    const storeNodes = input.nodes.map((node) => ({
      id: node.id,
      type: node.typeName,
      x: node.x,
      y: node.y,
      properties: {
        id: node.id,
        typeName: node.typeName,
        displayName: node.displayName,
        ...(node.properties || {}),
      },
    }));

    const storeEdges = input.edges.map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.fromNodeId,
      targetNodeId: edge.toNodeId,
      sourceAnchorId: `${edge.fromNodeId}_right`,
      targetAnchorId: `${edge.toNodeId}_left`,
    }));

    const configInfoForRun = {
      variables: [],
      inputParameters: [],
      nodes: runNodes,
      lines,
    };

    const configInfoForWeb = JSON.stringify({
      vueFlowData: { nodes: storeNodes, edges: storeEdges },
      logicFlowData: { nodes: storeNodes, edges: storeEdges },
      storeData: {
        nodes: storeNodes,
        edges: storeEdges,
        inputParameters: [],
        sessionVariables: [],
      },
      designerConfig: {
        flowType: input.flowType === 1 ? 'ai' : input.flowType === 2 ? 'approval' : 'logic',
        lastModified: new Date().toISOString(),
        version: '2.0.0',
      },
    });

    return {
      id: input.id,
      name: input.name,
      description: input.description,
      flowType: input.flowType,
      category: input.category,
      tags: input.tags,
      configInfoForRun,
      configInfoForWeb,
    };
  }

  private createStartNode(id: string, x: number, y: number): TemplateNodeDefinition {
    return { id, typeName: 'StartNode', displayName: 'Start', x, y };
  }

  private createReplyNode(id: string, x: number, y: number): TemplateNodeDefinition {
    return {
      id,
      typeName: 'ReplyNode',
      displayName: 'Reply',
      x,
      y,
      properties: {
        description: '默认自动回复上一节点输出；也可以填写固定回复内容。',
      },
    };
  }

  private createKnowledgeNode(id: string, x: number, y: number): TemplateNodeDefinition {
    return {
      id,
      typeName: 'KnowledgeNode',
      displayName: 'Knowledge',
      x,
      y,
      properties: {
        queryExpression: this.createFullTextExpression('knowledge_query', '{{sys.query}}'),
        topK: 5,
        threshold: 0.1,
        outputVariable: 'knowledge_context',
      },
    };
  }

  private createHttpNode(id: string, x: number, y: number): TemplateNodeDefinition {
    return {
      id,
      typeName: 'HttpNode',
      displayName: 'HTTP',
      x,
      y,
      properties: {
        method: 'GET',
        url: this.createFullTextExpression('http_url', 'https://api.example.com/search'),
        query: this.createFullTextExpression('http_query', 'q={{sys.query}}'),
        timeoutSeconds: 30,
      },
    };
  }

  private createLLMNode(
    id: string,
    x: number,
    y: number,
    userPrompt = '用户问题：{{sys.query}}',
  ): TemplateNodeDefinition {
    return {
      id,
      typeName: 'LLMNode',
      displayName: 'LLM',
      x,
      y,
      properties: {
        temperature: 0.7,
        systemPrompt: this.createFullTextExpression(
          'llm_system',
          '你是 NEXUS 工作流中的 AI 助手，请根据节点上下文给出准确、简洁的回答。',
        ),
        userPrompt: this.createFullTextExpression('llm_user', userPrompt),
      },
    };
  }

  private createFullTextExpression(idSuffix: string, text: string) {
    return {
      id: `tpl_${idSuffix}`,
      typeName: 'FullTextExpressionUnit',
      Text: text,
      children: [],
    };
  }
}
