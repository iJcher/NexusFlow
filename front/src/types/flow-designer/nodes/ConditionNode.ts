import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import type { AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import ConditionNodeWidget from '@/views/flow/designer/widgets/ConditionNodeWidget.vue';

export interface ConditionRule {
  id: string;
  expressionUnit: AnyExpressionUnit;
  description?: string;
  lineId?: string;
}

export interface ConditionNodeData extends NodeBase {
  typeName: 'ConditionNode';
  conditions: ConditionRule[];
  elseRule: ConditionRule;
}

const typeName = 'ConditionNode';

class ConditionNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 300;
    this.initializeNodeData();
    this.updateHeight();
  }

  initializeNodeData() {
    const generateRuleId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodeData: Partial<ConditionNodeData> = {
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "Condition",
      description: (this.properties.description as string | undefined) || "Execute different branches by condition",
      conditions: (this.properties.conditions as ConditionRule[] | undefined) || [
        {
          id: generateRuleId('condition'),
          expressionUnit: ExpressionUnitFactory.createJSExpression(''),
          description: 'Condition 1'
        }
      ],
      elseRule: (this.properties.elseRule as ConditionRule | undefined) || {
        id: generateRuleId('else'),
        expressionUnit: ExpressionUnitFactory.createJSExpression(''),
        description: 'Else branch'
      },
      defaultDescription: (this.properties.defaultDescription as string | undefined) || 'Default branch'
    };
    this.setNodeData(nodeData);
  }

  updateHeight() {
    const conditions = (this.properties.conditions as ConditionRule[] | undefined) || [];
    this.height = 36 + (conditions.length * 48) + 32 + 16;
  }

  setProperties(properties: Record<string, any>) {
    super.setProperties(properties);
    this.updateHeight();
  }

  getDefaultAnchor() {
    const { width, height, x, y, id } = this;
    const conditions = (this.properties.conditions as ConditionRule[] | undefined) || [];
    const elseRule = this.properties.elseRule as ConditionRule | undefined;
    const dataArr: Array<{ x: number; y: number; id: string }> = [];

    dataArr.push({ x: x - width / 2, y: y - height / 2 + 18, id: `${id}_input` });

    const headerHeight = 36;
    const conditionRowHeight = 48;
    const nodeTopY = y - height / 2;
    const rightX = x + width / 2;

    conditions.forEach((condition: ConditionRule, index: number) => {
      const conditionY = nodeTopY + headerHeight + (index * conditionRowHeight) + conditionRowHeight / 2;
      dataArr.push({ x: rightX, y: conditionY, id: condition.id });
    });

    if (elseRule) {
      const elseY = nodeTopY + headerHeight + (conditions.length * conditionRowHeight) + 16;
      dataArr.push({ x: rightX, y: elseY, id: elseRule.id });
    }

    return dataArr;
  }

  onEdgeAdd(edgeId: string, sourceAnchorId: string, _targetNodeId: string, _targetAnchorId: string): void {
    const conditions = (this.properties.conditions as ConditionRule[] | undefined) || [];
    const elseRule = this.properties.elseRule as ConditionRule | undefined;

    const condition = conditions.find((c: ConditionRule) => c.id === sourceAnchorId);
    if (condition) {
      condition.lineId = edgeId;
      this.setNodeData({ conditions: [...conditions] });
      return;
    }
    if (elseRule && elseRule.id === sourceAnchorId) {
      elseRule.lineId = edgeId;
      this.setNodeData({ elseRule: { ...elseRule } });
    }
  }

  onEdgeDelete(edgeId: string, sourceAnchorId: string): void {
    const conditions = (this.properties.conditions as ConditionRule[] | undefined) || [];
    const elseRule = this.properties.elseRule as ConditionRule | undefined;

    const condition = conditions.find((c: ConditionRule) => c.id === sourceAnchorId);
    if (condition && condition.lineId === edgeId) {
      condition.lineId = undefined;
      this.setNodeData({ conditions: [...conditions] });
      return;
    }
    if (elseRule && elseRule.id === sourceAnchorId && elseRule.lineId === edgeId) {
      elseRule.lineId = undefined;
      this.setNodeData({ elseRule: { ...elseRule } });
    }
  }

  onPropertiesUpdated(lf: any, flowStore: any): void {
    if (!lf || !flowStore) return;
    this.updateHeight();

    try {
      const relatedEdges = flowStore.currentEdges.filter((edge: any) =>
        edge.sourceNodeId === this.id || edge.targetNodeId === this.id
      );
      if (relatedEdges.length === 0) return;

      const currentConditions = (this.properties.conditions as ConditionRule[] | undefined) || [];
      const currentElseRule = this.properties.elseRule as ConditionRule | undefined;

      const edgeInfos = relatedEdges.map((edge: any) => ({
        id: edge.id,
        type: edge.type || 'polyline',
        sourceNodeId: edge.sourceNodeId,
        targetNodeId: edge.targetNodeId,
        sourceAnchorId: edge.sourceAnchorId,
        targetAnchorId: edge.targetAnchorId,
        properties: edge.properties
      }));

      edgeInfos.forEach((edgeInfo: any) => lf.deleteEdge(edgeInfo.id));

      edgeInfos.forEach((edgeInfo: any) => {
        if (edgeInfo.sourceNodeId === this.id) {
          const anchorId = edgeInfo.sourceAnchorId;
          const conditionExists = currentConditions.some((c: ConditionRule) => c.id === anchorId);
          const isElseRule = currentElseRule && currentElseRule.id === anchorId;
          if (!conditionExists && !isElseRule) return;
        }
        lf.addEdge({
          id: edgeInfo.id,
          type: edgeInfo.type,
          sourceNodeId: edgeInfo.sourceNodeId,
          targetNodeId: edgeInfo.targetNodeId,
          sourceAnchorId: edgeInfo.sourceAnchorId,
          targetAnchorId: edgeInfo.targetAnchorId,
          properties: edgeInfo.properties
        });
      });
    } catch (error) {
      console.error('Condition node edge refresh failed:', error);
    }
  }
}

class ConditionNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return ConditionNodeWidget;
  }
}

export default {
  type: typeName,
  view: ConditionNodeView,
  model: ConditionNodeModel,
};
