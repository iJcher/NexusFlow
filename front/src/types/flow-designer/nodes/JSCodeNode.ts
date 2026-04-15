import { NodeBaseModel } from '../NodeBase';
import type { NodeBase, NodeOutputItem } from '../NodeBase';
import { VariableItemType } from '../Parameters/Variable';
import type { AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import JSCodeNodeWidget from '@/views/flow/designer/widgets/JSCodeNodeWidget.vue';

const typeName = 'JSCodeNode';

export interface JSCodeNodeData extends NodeBase {
  typeName: 'JSCodeNode';
  codeUnit?: AnyExpressionUnit;
}

class JSCodeNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 280;
    this.height = 240;

    const defaultCodeTemplate = `function main() {
  // use variables, for example: {{age}} 
  return {
    x: 1,
    y: "ok"
  };
}`;

    const nodeData: Partial<JSCodeNodeData> = {
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "JS Code",
      description: (this.properties.description as string | undefined) || "Execute JavaScript code",
      hasOutput: true,
      outputs: (this.properties.outputs as NodeOutputItem[] | undefined) || [
        { name: 'x', variableType: VariableItemType.LongVariable },
        { name: 'y', variableType: VariableItemType.StringVariable }
      ],
      codeUnit: (this.properties.codeUnit as AnyExpressionUnit | undefined) || (() => {
        const unit = ExpressionUnitFactory.createJSExpression(defaultCodeTemplate, '');
        unit.isFunctionMode = true;
        return unit;
      })()
    };
    this.setNodeData(nodeData);
  }
}

class JSCodeNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return JSCodeNodeWidget;
  }
}

export default {
  type: typeName,
  view: JSCodeNodeView,
  model: JSCodeNodeModel,
};
