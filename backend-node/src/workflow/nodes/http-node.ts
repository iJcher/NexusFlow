import { NodeConfig, FlowRuntimeContext, NodeExecuteResult } from '../types';
import { createSuccessResult, createErrorResult, FlowRuntime } from './node-base';
import { replacePlaceholders } from '../expression/expression-helper';

interface HttpKeyValueItem {
  enabled?: boolean;
  key?: string;
  value?: string;
}

export async function executeHttpNode(
  node: NodeConfig,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<NodeExecuteResult> {
  try {
    const urlText = await resolveTextField(node.url, context, runtime);
    if (!urlText) return createErrorResult(node.id, 'HTTP url is required');

    let finalUrl = urlText;
    const queryText = await resolveTextField(node.query, context, runtime);
    if (queryText) {
      if (queryText.startsWith('?') || queryText.startsWith('&')) {
        finalUrl += queryText;
      } else {
        finalUrl += (urlText.includes('?') ? '&' : '?') + queryText;
      }
    }

    const queryParams = await resolveKeyValueItems(node.queryParams || [], context, runtime);
    if (queryParams.length > 0) {
      const url = new URL(finalUrl);
      queryParams.forEach(({ key, value }) => url.searchParams.set(key, value));
      finalUrl = url.toString();
    }

    const method = (node.method || 'GET').toUpperCase();
    const timeoutMs = ((node.timeoutSeconds || 30) <= 0 ? 30 : node.timeoutSeconds || 30) * 1000;
    const headers: Record<string, string> = {};

    const fetchOptions: RequestInit = {
      method,
      signal: AbortSignal.timeout(timeoutMs),
    };

    const bodyText = await resolveTextField(node.body, context, runtime);
    if (bodyText && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      fetchOptions.body = bodyText;
      if (node.bodyMode === 'json') {
        headers['Content-Type'] = 'application/json';
      }
    }

    const headersText = await resolveTextField(node.headers, context, runtime);
    if (headersText) {
      const headerLines = headersText.split(/[\r\n]+/).filter((l: string) => l.trim());
      for (const line of headerLines) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const name = line.substring(0, idx).trim();
        const value = line.substring(idx + 1).trim();
        if (name) headers[name] = value;
      }
    }

    const headerParams = await resolveKeyValueItems(node.headerParams || [], context, runtime);
    headerParams.forEach(({ key, value }) => {
      headers[key] = value;
    });

    if (Object.keys(headers).length > 0) {
      fetchOptions.headers = headers;
    }

    const response = await fetch(finalUrl, fetchOptions);
    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const json = tryParseJson(responseBody);

    return createSuccessResult(node.id, {
      responseBody,
      json,
      statusCode: response.status,
      ok: response.ok,
      headers: responseHeaders,
      url: finalUrl,
    });
  } catch (e: any) {
    return createErrorResult(node.id, `http node failed: ${e.message}`);
  }
}

async function resolveTextField(
  field: any,
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<string> {
  if (!field) return '';
  if (typeof field === 'string') return replacePlaceholders(context, runtime, field);
  const text = field.text ?? field.Text ?? '';
  return replacePlaceholders(context, runtime, text);
}

async function resolveKeyValueItems(
  items: HttpKeyValueItem[],
  context: FlowRuntimeContext,
  runtime: FlowRuntime,
): Promise<Array<{ key: string; value: string }>> {
  const result: Array<{ key: string; value: string }> = [];

  for (const item of items) {
    if (item.enabled === false || !item.key) continue;
    const key = await replacePlaceholders(context, runtime, item.key);
    const value = await replacePlaceholders(context, runtime, item.value || '');
    if (key.trim()) result.push({ key: key.trim(), value });
  }

  return result;
}

function tryParseJson(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
