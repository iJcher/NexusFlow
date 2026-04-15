import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import type { AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import AssignNodeWidget from '@/views/flow/designer/widgets/AssignNodeWidget.vue';

export interface AssignmentItem {
  id: string;
  targetVariableName: string;
  expressionUnit: AnyExpressionUnit;
}

export interface AssignVariableNodeData extends NodeBase {
  typeName: 'AssignVariableNode';
  assignments: AssignmentItem[];
}

const typeName = 'AssignVariableNode';

class AssignVariableNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 300;
    this.initializeNodeData();
    this.updateHeight();
  }

  initializeNodeData() {
    const generateAssignmentId = () => `assign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodeData: Partial<AssignVariableNodeData> = {
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "Assign",
      description: (this.properties.description as string | undefined) || "Assign session variables",
      assignments: (this.properties.assignments as AssignmentItem[] | undefined) || [
        {
          id: generateAssignmentId(),
          targetVariableName: '',
          expressionUnit: ExpressionUnitFactory.createJSExpression('')
        }
      ]
    };
    this.setNodeData(nodeData);
  }

  updateHeight() {
    const assignments = (this.properties.assignments as AssignmentItem[] | undefined) || [];
    this.height = 70 + (assignments.length * 42) + 16;
  }

  setProperties(properties: Record<string, any>) {
    super.setProperties(properties);
    this.updateHeight();
  }

  onPropertiesUpdated(lf: any, flowStore: any): void {
    if (!lf || !flowStore) return;
    this.updateHeight();
  }
}

class AssignVariableNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return AssignNodeWidget;
  }
}

export default {
  type: typeName,
  view: AssignVariableNodeView,
  model: AssignVariableNodeModel,
};
