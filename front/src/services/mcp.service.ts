import type { TApiResponse } from '@/types/ApiResponse{T}'
import { HttpUtil } from '@/utils/http.util'

export interface IMcpServerDto {
  id: string
  name: string
  transport: 'sse' | 'streamable-http' | 'stdio'
  endpoint: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
  tools: Array<Record<string, unknown>>
  status: string
  lastSyncAt?: string
  createdAt: string
  updatedAt: string
}

export class McpService {
  static async create(data: Partial<IMcpServerDto>): Promise<TApiResponse<IMcpServerDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<IMcpServerDto>>('/Mcp/Create', data)
    return res.data
  }

  static async getList(): Promise<TApiResponse<IMcpServerDto[]>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<IMcpServerDto[]>>('/Mcp/GetList')
    return res.data
  }

  static async delete(id: string): Promise<TApiResponse<boolean>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<boolean>>(
      '/Mcp/Delete',
      null,
      { params: { id } },
    )
    return res.data
  }
}
