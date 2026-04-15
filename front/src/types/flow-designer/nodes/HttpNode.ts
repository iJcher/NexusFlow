import { NodeBaseModel } from '../NodeBase';
import type { NodeBase, NodeOutputItem } from '../NodeBase';
import { VariableItemType } from '../Parameters/Variable';
import type { FullTextMiniExpressionUnit, FullTextExpressionUnit, AnyExpressionUnit } from '../ExpressionUnits/ExpressionUnitBase';
import { ExpressionUnitFactory } from '../ExpressionUnits/ExpressionUnitBase';
import { NodeBaseView } from '../NodeBaseView';
import HttpNodeWidget from '@/views/flow/designer/widgets/HttpNodeWidget.vue';

const typeName = 'HttpNode';

export type HttpMethod = 'GET' | 'POST';

export interface HttpNodeData extends NodeBase {
  typeName: 'HttpNode';
  method?: HttpMethod;
  url?: FullTextMiniExpressionUnit;
  headers?: FullTextExpressionUnit;
  query?: FullTextExpressionUnit;
  body?: AnyExpressionUnit;
  timeoutSeconds?: number;
}

class HttpNodeModel extends NodeBaseModel {
  setAttributes() {
    super.setAttributes();
    this.width = 280;
    this.height = 280;

    const nodeData: Partial<HttpNodeData> = {
      typeName,
      displayName: (this.properties.displayName as string | undefined) || 'HTTP',
      description: (this.properties.description as string | undefined) || 'Send HTTP request',
      hasOutput: true,
      outputs: (this.properties.outputs as NodeOutputItem[] | undefined) || [
        { name: 'responseBody', variableType: VariableItemType.StringVariable },
        { name: 'statusCode', variableType: VariableItemType.LongVariable },
      ],
      method: (this.properties.method as HttpMethod | undefined) || 'GET',
      url: (this.properties.url as FullTextMiniExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextMiniExpression('https://api.example.com'),
      headers: (this.properties.headers as FullTextExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression('Content-Type: application/json'),
      query: (this.properties.query as FullTextExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression('?name=abc'),
      body: (this.properties.body as AnyExpressionUnit | undefined) || ExpressionUnitFactory.createFullTextExpression(''),
      timeoutSeconds: (this.properties.timeoutSeconds as number | undefined) ?? 5,
    };
    this.setNodeData(nodeData);
  }
}

class HttpNodeView extends NodeBaseView {
  protected getWidgetComponent() {
    return HttpNodeWidget;
  }
}

export default {
  type: typeName,
  view: HttpNodeView,
  model: HttpNodeModel,
};
