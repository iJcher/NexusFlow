import type { IMcpConnection } from '@/types/execution-v2.types'
import { object, request } from './execution.service'

function connection(raw: unknown): IMcpConnection {
  const value = object(raw)
  if (typeof value.id !== 'string' || typeof value.name !== 'string' || typeof value.url !== 'string' || typeof value.revision !== 'number' || !Array.isArray(value.tools) || !Array.isArray(value.readTools))
    throw new Error('INVALID_CONNECTION_RESPONSE')
  return { id: value.id, name: value.name, url: value.url, authType: String(value.authType), hasCredential: value.hasCredential === true, enabled: value.enabled === true, revision: value.revision, readTools: value.readTools.map(String), tools: value.tools.map((raw: unknown) => {
    const tool = object(raw)
    return { name: String(tool.name), description: String(tool.description || ''), reportedReadOnly: tool.reportedReadOnly === true, reportedDestructive: tool.reportedDestructive === true }
  }) }
}
export class McpService {
  static async list() {
    const result = await request('GET', '/mcp/connections')
    if (!Array.isArray(result))
      throw new Error('INVALID_CONNECTION_RESPONSE')
    return result.map(connection)
  }

  static async create(input: { name: string, url: string, authType: string, token?: string }) { return connection(await request('POST', '/mcp/connections', input)) }
  static async discover(id: string) { return connection(await request('POST', `/mcp/connections/${id}/discover`)) }
  static async update(item: IMcpConnection, token?: string) { return connection(await request('PUT', `/mcp/connections/${item.id}`, { revision: item.revision, enabled: item.enabled, readTools: item.readTools, ...(token ? { token } : {}) })) }
}
