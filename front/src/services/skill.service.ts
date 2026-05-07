import type { TApiResponse } from '@/types/ApiResponse{T}'
import { HttpUtil } from '@/utils/http.util'

export interface ISkillDto {
  id: string
  flowId: string
  name: string
  description: string
  version: number
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  files: Record<string, string>
  modelName: string
  status: string
  createdAt: string
  updatedAt: string
}

export class SkillService {
  static async generateFromFlow(data: {
    flowId: string
    name?: string
    description?: string
    modelName?: string
  }): Promise<TApiResponse<ISkillDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<ISkillDto>>(
      '/Skill/GenerateFromFlow',
      data,
    )
    return res.data
  }

  static async getList(): Promise<TApiResponse<ISkillDto[]>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<ISkillDto[]>>('/Skill/GetList')
    return res.data
  }

  static async delete(id: string): Promise<TApiResponse<boolean>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<boolean>>(
      '/Skill/Delete',
      null,
      { params: { id } },
    )
    return res.data
  }
}
