import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProviderService } from '../llm-provider/llm-provider.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { nextId } from '../common/snowflake';
import {
  FlowConfigInfo,
  FlowRuntimeContext,
  NodeConfig,
  NodeExecuteResult,
  AIChatRequest,
  TokenUsage,
} from './types';
import { FlowRuntime } from './nodes/node-base';
import { getDefaultExecuteLine } from './nodes/node-base';
import { executeStartNode } from './nodes/start-node';
import { executeEndNode } from './nodes/end-node';
import { executeConditionNode, getConditionExecuteLine } from './nodes/condition-node';
import { executeAssignVariableNode } from './nodes/assign-variable-node';
import { executeJSCodeNode } from './nodes/js-code-node';
import { executeHttpNode } from './nodes/http-node';
import { executeLLMNode } from './nodes/llm-node';
import { executeReplyNode } from './nodes/reply-node';
import { executeKnowledgeNode } from './nodes/knowledge-node';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class FlowRuntimeService {
  private readonly logger = new Logger(FlowRuntimeService.name);

  constructor(
    private prisma: PrismaService,
    private llmProviderService: LlmProviderService,
    private knowledgeService: KnowledgeService,
  ) {}

  async runFlowStreaming(flowId: bigint, request: AIChatRequest, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const flowEntity = await this.prisma.flowEntity.findUnique({ where: { id: flowId } });
    if (!flowEntity || !flowEntity.configInfoForRun) {
      this.sendSSE(res, 'error', { message: 'Flow not found or no config' });
      res.end();
      return;
    }

    const flowConfig: FlowConfigInfo = JSON.parse(flowEntity.configInfoForRun);
    const flowInstanceId = nextId();
    let conversationId = request.conversationId || uuidv4();
    let dialogueCount = 0;

    let conversationEntity = request.conversationId
      ? await this.prisma.flowChatConversationEntity.findUnique({
          where: { conversationId: request.conversationId },
        })
      : null;

    if (conversationEntity) {
      dialogueCount = conversationEntity.messageCount;
      const savedVars: Record<string, any> = conversationEntity.variables
        ? JSON.parse(conversationEntity.variables)
        : {};
      for (const v of flowConfig.variables || []) {
        if (savedVars[v.name] !== undefined) {
          v.value = savedVars[v.name];
          v.hasValue = true;
        }
      }
    } else {
      conversationId = uuidv4();
    }

    if (request.inputs) {
      for (const inputParam of flowConfig.inputParameters || []) {
        if (request.inputs[inputParam.name] !== undefined) {
          inputParam.value = request.inputs[inputParam.name];
          inputParam.hasValue = true;
        }
      }
    }

    const context: FlowRuntimeContext = {
      flowId,
      user: request.user,
      flowInstanceId,
      displayName: flowEntity.displayName,
      flowConfigInfoForRun: flowConfig,
      startTime: new Date(),
      inputVariables: flowConfig.inputParameters || [],
      inputVariablesOriginal: request.inputs || {},
      variables: flowConfig.variables || [],
      request,
      conversationId,
      dialogueCount,
      files: request.files,
    };

    const nodeResults = new Map<string, NodeExecuteResult>();
    let fullResponseText = '';
    const totalTokenUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    const runtime: FlowRuntime = {
      currentNode: null,
      getNodeExecuteResult: async (_ctx, nodeId) => nodeResults.get(nodeId) || null,
    };

    this.sendSSE(res, 'workflow_started', {
      data: {
        conversationId,
        flowInstanceId: flowInstanceId.toString(),
      },
    });

    try {
      const startNode = flowConfig.nodes.find((n) => n.typeName === 'StartNode');
      if (!startNode) {
        this.sendSSE(res, 'error', { message: 'No start node found' });
        res.end();
        return;
      }

      runtime.currentNode = startNode;
      const startResult = executeStartNode(startNode);
      nodeResults.set(startNode.id, startResult);

      await this.runNextNode(startNode, context, runtime, nodeResults, res, fullResponseText, totalTokenUsage, (text) => {
        fullResponseText = text;
      });
    } catch (e: any) {
      this.logger.error(`Flow execution error: ${e.message}`, e.stack);
      this.sendSSE(res, 'error', { message: e.message });
    }

    const varsToSave: Record<string, any> = {};
    for (const v of context.variables) {
      varsToSave[v.name] = v.hasValue ? v.value : v.defaultValue ?? null;
    }

    try {
      if (!conversationEntity) {
        const title =
          request.query.length > 10 ? request.query.substring(0, 10) + '...' : request.query;
        await this.prisma.flowChatConversationEntity.create({
          data: {
            conversationId,
            user: request.user,
            flowId,
            title,
            messageCount: 1,
            promptTokens: totalTokenUsage.promptTokens,
            completionTokens: totalTokenUsage.completionTokens,
            totalTokens: totalTokenUsage.totalTokens,
            variables: JSON.stringify(varsToSave),
          },
        });
      } else {
        await this.prisma.flowChatConversationEntity.update({
          where: { conversationId },
          data: {
            messageCount: { increment: 1 },
            updatedAt: new Date(),
            promptTokens: totalTokenUsage.promptTokens,
            completionTokens: totalTokenUsage.completionTokens,
            totalTokens: totalTokenUsage.totalTokens,
            variables: JSON.stringify(varsToSave),
          },
        });
      }

      await this.prisma.flowChatMessageEntity.create({
        data: {
          id: nextId(),
          user: request.user,
          flowId,
          conversationId,
          flowInstanceId,
          question: request.query,
          answer: fullResponseText,
          promptTokens: totalTokenUsage.promptTokens,
          completionTokens: totalTokenUsage.completionTokens,
          totalTokens: totalTokenUsage.totalTokens,
          files: request.files ? JSON.stringify(request.files) : null,
        },
      });
    } catch (e: any) {
      this.logger.error(`Failed to save conversation: ${e.message}`);
    }

    this.sendSSE(res, 'workflow_finished', {
      data: {
        conversationId,
        totalTokens: totalTokenUsage.totalTokens,
      },
    });
    res.end();
  }

  private async runNextNode(
    currentNode: NodeConfig,
    context: FlowRuntimeContext,
    runtime: FlowRuntime,
    nodeResults: Map<string, NodeExecuteResult>,
    res: Response,
    fullResponseText: string,
    totalTokenUsage: TokenUsage,
    setFullResponse: (text: string) => void,
  ) {
    let line =
      currentNode.typeName === 'ConditionNode'
        ? await getConditionExecuteLine(currentNode, context, runtime)
        : getDefaultExecuteLine(currentNode.id, context);

    if (!line) return;

    const nextNode = context.flowConfigInfoForRun.nodes.find((n) => n.id === line!.toNodeId);
    if (!nextNode) return;

    if (nextNode.typeName === 'EndNode') return;

    runtime.currentNode = nextNode;
    const result = await this.executeNode(nextNode, context, runtime);
    nodeResults.set(nextNode.id, result);

    this.sendSSE(res, 'node_started', { node_id: nextNode.id, node_type: nextNode.typeName });

    if (!result.isSuccess) {
      this.sendSSE(res, 'error', { node_id: nextNode.id, message: result.errorMsg });
      return;
    }

    if (result.streamingExecutor && nextNode.typeName === 'ReplyNode') {
      for await (const chunk of result.streamingExecutor()) {
        fullResponseText += chunk;
        this.sendSSE(res, 'message', { answer: chunk });
      }
      setFullResponse(fullResponseText);
    }

    if (nextNode.typeName === 'LLMNode' && result.result?.tokenUsage) {
      const tu = result.result.tokenUsage as TokenUsage;
      totalTokenUsage.promptTokens += tu.promptTokens;
      totalTokenUsage.completionTokens += tu.completionTokens;
      totalTokenUsage.totalTokens += tu.totalTokens;
    }

    this.sendSSE(res, 'node_finished', { node_id: nextNode.id, node_type: nextNode.typeName });

    await this.runNextNode(nextNode, context, runtime, nodeResults, res, fullResponseText, totalTokenUsage, setFullResponse);
  }

  private async executeNode(
    node: NodeConfig,
    context: FlowRuntimeContext,
    runtime: FlowRuntime,
  ): Promise<NodeExecuteResult> {
    switch (node.typeName) {
      case 'StartNode':
        return executeStartNode(node);
      case 'EndNode':
        return executeEndNode(node);
      case 'ConditionNode':
        return executeConditionNode(node);
      case 'AssignVariableNode':
        return executeAssignVariableNode(node, context, runtime);
      case 'JSCodeNode':
        return executeJSCodeNode(node, context, runtime);
      case 'HttpNode':
        return executeHttpNode(node, context, runtime);
      case 'LLMNode':
        return executeLLMNode(node, context, runtime, (model) =>
          this.llmProviderService.findProviderByModelName(model),
        );
      case 'ReplyNode':
        return executeReplyNode(node, context, runtime);
      case 'KnowledgeNode':
        return executeKnowledgeNode(node, context, runtime, (ids, query, opts) =>
          this.knowledgeService.searchMultiple(ids, query, opts),
        );
      default:
        return { nodeId: node.id, isSuccess: false, errorMsg: `Unknown node type: ${node.typeName}`, errorCode: 61002 };
    }
  }

  private sendSSE(res: Response, event: string, data: any) {
    const payload = { event, ...data };
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
