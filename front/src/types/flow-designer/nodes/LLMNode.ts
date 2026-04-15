import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import { VariableItemType } from '../Parameters/Variable';
import type { AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import LLMNodeWidget from '@/views/flow/designer/widgets/LLMNodeWidget.vue';

const typeName = 'LLMNode'

export interface LLMNodeData extends NodeBase {
  typeName: 'LLMNode';
  modelSelection?: string;
  temperature?: number;
  systemPrompt?: AnyExpressionUnit;
  userPrompt?: AnyExpressionUnit;
  memoryEnabled?: boolean;
  memoryRounds?: number;
  enableThinking?: boolean;
  pictures?: AnyExpressionUnit;
}

class LLMNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 280;
    this.height = 360;
    const nodeData: Partial<LLMNodeData> = {
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "LLM",
      description: (this.properties.description as string | undefined) || "Call large language model",
      hasOutput: true,
      outputs: [
        { name: 'text', variableType: VariableItemType.StringVariable }
      ],
      modelSelection: (this.properties.modelSelection as string | undefined) || '',
      temperature: (this.properties.temperature as number | undefined) !== undefined ? (this.properties.temperature as number) : 0.7,
      systemPrompt: (this.properties.systemPrompt as AnyExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression(''),
      userPrompt: (this.properties.userPrompt as AnyExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression(''),
      memoryEnabled: (this.properties.memoryEnabled as boolean | undefined) !== undefined ? (this.properties.memoryEnabled as boolean) : false,
      memoryRounds: (this.properties.memoryRounds as number | undefined) !== undefined ? (this.properties.memoryRounds as number) : 5,
      enableThinking: (this.properties.enableThinking as boolean | undefined) !== undefined ? (this.properties.enableThinking as boolean) : false,
      pictures: (this.properties.pictures as AnyExpressionUnit | undefined) || ExpressionUnitFactory.createJSExpression('')
    };
    this.setNodeData(nodeData);
  }
}

class LLMNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return LLMNodeWidget;
  }
}

export default {
  type: typeName,
  view: LLMNodeView,
  model: LLMNodeModel,
};
