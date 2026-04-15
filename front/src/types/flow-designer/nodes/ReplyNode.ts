import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import type { AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import ReplyNodeWidget from '@/views/flow/designer/widgets/ReplyNodeWidget.vue';

const typeName = 'ReplyNode'

export interface ReplyNodeData extends NodeBase {
  typeName: 'ReplyNode';
  message: AnyExpressionUnit;
}

class ReplyNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 260;
    this.height = 130;
    this.resizable = false;
    const nodeData: Partial<ReplyNodeData> = {
      message: (this.properties.message as AnyExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression(''),
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "Reply"
    };
    this.setNodeData(nodeData);
  }
}

class ReplyNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return ReplyNodeWidget;
  }
}

export default {
  type: typeName,
  view: ReplyNodeView,
  model: ReplyNodeModel,
};
