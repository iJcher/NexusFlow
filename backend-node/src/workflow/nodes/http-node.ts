import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { replacePlaceholders } from '../expression/expression-helper';

export async function executeHttpNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  try {
    const urlText = node.url?.text
      ? await replacePlaceholders(context, runtime, node.url.text)
      : '';
    if (!urlText) return createErrorResult(node.id, 'HTTP url is required');

    let queryText = '';
    if (node.query?.text) {
      queryText = await replacePlaceholders(context, runtime, node.query.text);
    }

    let finalUrl = urlText;
    if (queryText) {
      if (queryText.startsWith('?') || queryText.startsWith('&')) {
        finalUrl += queryText;
      } else {
        finalUrl += (urlText.includes('?') ? '&' : '?') + queryText;
      }
    }

    const method = (node.method || 'GET').toUpperCase();
    const timeoutMs = ((node.timeoutSeconds || 30) <= 0 ? 30 : node.timeoutSeconds || 30) * 1000;

    const fetchOptions: RequestInit = {
      method,
      signal: AbortSignal.timeout(timeoutMs),
    };

    let bodyText = '';
    if (node.body?.text) {
      bodyText = await replacePlaceholders(context, runtime, node.body.text);
    }
    if (bodyText && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fetchOptions.body = bodyText;
      fetchOptions.headers = { 'Content-Type': 'application/json' };
    }

    if (node.headers?.text) {
      const headersText = await replacePlaceholders(context, runtime, node.headers.text);
      const headerLines = headersText.split(/[\r\n]+/).filter((l: string) => l.trim());
      const headers: Record<string, string> = (fetchOptions.headers as any) || {};
      for (const line of headerLines) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const name = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (name) headers[name] = value;
      }
      fetchOptions.headers = headers;
    }

    const response = await fetch(finalUrl, fetchOptions);
    const responseBody = await response.text();

    return createSuccessResult(node.id, { responseBody, statusCode: response.status });
  } catch (e: any) {
    return createErrorResult(node.id, `http node failed: ${e.message}`);
  }
}
