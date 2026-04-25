import type { TApiResponse } from '@/types/ApiResponse{T}'
import type { IFlowConfigInfo } from '@/types/flow.types'
import { HttpUtil } from '@/utils/http.util'

export interface ITemplateDto {
  id: string
  name: string
  description: string
  flowType: number
  category: string
  tags: string[]
  configInfoForRun: IFlowConfigInfo | null
  configInfoForWeb: string | null
  isOfficial: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ITemplateListResponse {
  total: number
  items: ITemplateDto[]
}

export class TemplateService {
  static async create(data: {
    name: string
    description?: string
    flowType: number
    category?: string
    tags?: string[]
    configInfoForRun?: IFlowConfigInfo | null
    configInfoForWeb?: string
  }): Promise<TApiResponse<ITemplateDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<ITemplateDto>>(
      '/FlowTemplate/Create',
      data,
    )
    return res.data
  }

  static async createFromFlow(data: {
    flowId: string
    name?: string
    description?: string
    category?: string
    tags?: string[]
  }): Promise<TApiResponse<ITemplateDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<ITemplateDto>>(
      '/FlowTemplate/CreateFromFlow',
      data,
    )
    return res.data
  }

  static async getById(id: string): Promise<TApiResponse<ITemplateDto>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<ITemplateDto>>(
      '/FlowTemplate/GetById',
      { params: { id } },
    )
    return res.data
  }

  static async getList(params?: {
    flowType?: number
    category?: string
    isOfficial?: boolean
    keyword?: string
    pageIndex?: number
    pageSize?: number
  }): Promise<TApiResponse<ITemplateListResponse>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<ITemplateListResponse>>(
      '/FlowTemplate/GetList',
      { params },
    )
    return res.data
  }

  static async update(data: {
    id: string
    name?: string
    description?: string
    category?: string
    tags?: string[]
  }): Promise<TApiResponse<ITemplateDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<ITemplateDto>>(
      '/FlowTemplate/Update',
      data,
    )
    return res.data
  }

  static async delete(id: string): Promise<TApiResponse<boolean>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<boolean>>(
      '/FlowTemplate/Delete',
      null,
      { params: { id } },
    )
    return res.data
  }
}
