import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import { NodeBaseView } from '../NodeBaseView';
import StartNodeWidget from '@/views/flow/designer/widgets/StartNodeWidget.vue';

const typeName = 'StartNode'

export interface StartNodeData extends NodeBase {
  typeName: 'StartNode';
}

class StartNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 220;
    this.height = 64;
    const nodeData: Partial<StartNodeData> = {
      typeName: typeName,
      displayName: (this.properties.displayName as string | undefined) || "Start"
    };
    this.setNodeData(nodeData);
  }

  getConnectedTargetRules() {
    const rules = super.getConnectedTargetRules();
    const notAsTarget = {
      message: 'Start node cannot be a connection target',
      validate: () => false,
    };
    rules.push(notAsTarget);
    return rules;
  }
}

class StartNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return StartNodeWidget;
  }
}

export default {
  type: typeName,
  view: StartNodeView,
  model: StartNodeModel,
};
