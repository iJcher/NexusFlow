import { NodeBaseModel } from '../NodeBase';
import type { NodeBase } from '../NodeBase';
import { NodeBaseView } from '../NodeBaseView';
import ResultNodeWidget from '@/views/flow/designer/widgets/ResultNodeWidget.vue';

const typeName = 'ResultNode';

export type ResultStatus = 'idle' | 'running' | 'done' | 'error';

export interface ResultNodeData extends NodeBase {
  typeName: 'ResultNode';
  query?: string;
  result?: string;
  status?: ResultStatus;
}

class ResultNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 300;
    this.height = 320;
    const nodeData: Partial<ResultNodeData> = {
      typeName,
      displayName: (this.properties.displayName as string | undefined) || 'Result',
      description: (this.properties.description as string | undefined) || 'Run workflow and display result',
      hasOutput: false,
      status: 'idle',
    };
    this.setNodeData(nodeData);
  }

  getConnectedSourceRules() {
    const rules = super.getConnectedSourceRules();
    rules.push({
      message: 'Result node cannot be a connection source',
      validate: () => false,
    });
    return rules;
  }
}

class ResultNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return ResultNodeWidget;
  }
}

export default {
  type: typeName,
  view: ResultNodeView,
  model: ResultNodeModel,
};
