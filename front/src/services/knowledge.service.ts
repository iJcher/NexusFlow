import type { TApiResponse } from '@/types/ApiResponse{T}'
import { HttpUtil } from '@/utils/http.util'

export interface IKnowledgeBaseDto {
  id: string
  name: string
  description: string
  createdBy: string
  docCount: number
  chunkCount: number
  status: string
  createdAt: string
  updatedAt: string
  documents?: IKnowledgeDocDto[]
}

export interface IKnowledgeDocDto {
  id: string
  knowledgeBaseId: string
  fileName: string
  fileSize: number
  fileType: string
  chunkCount: number
  status: string
  errorMsg: string | null
  createdAt: string
  updatedAt: string
}

export interface IDocChunkDto {
  id: string
  chunkIndex: number
  content: string
  tokenCount: number
}

export interface ISearchResultDto {
  chunkId: string
  documentId: string
  fileName: string
  content: string
  chunkIndex: number
  similarity: number
}

export interface IKnowledgeListResponse {
  total: number
  items: IKnowledgeBaseDto[]
}

export class KnowledgeService {
  static async create(data: {
    name: string
    description?: string
  }): Promise<TApiResponse<IKnowledgeBaseDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<IKnowledgeBaseDto>>(
      '/Knowledge/Create',
      data,
    )
    return res.data
  }

  static async getById(id: string): Promise<TApiResponse<IKnowledgeBaseDto>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<IKnowledgeBaseDto>>(
      '/Knowledge/GetById',
      { params: { id } },
    )
    return res.data
  }

  static async getList(params?: {
    keyword?: string
    pageIndex?: number
    pageSize?: number
  }): Promise<TApiResponse<IKnowledgeListResponse>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<IKnowledgeListResponse>>(
      '/Knowledge/GetList',
      { params },
    )
    return res.data
  }

  static async update(data: {
    id: string
    name?: string
    description?: string
  }): Promise<TApiResponse<IKnowledgeBaseDto>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<IKnowledgeBaseDto>>(
      '/Knowledge/Update',
      data,
    )
    return res.data
  }

  static async delete(id: string): Promise<TApiResponse<boolean>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<boolean>>(
      '/Knowledge/Delete',
      null,
      { params: { id } },
    )
    return res.data
  }

  static async uploadDocument(
    knowledgeBaseId: string,
    file: File,
    options?: { chunkSize?: number; chunkOverlap?: number },
  ): Promise<TApiResponse<IKnowledgeDocDto>> {
    const formData = new FormData()
    formData.append('file', file)
    const params: any = { knowledgeBaseId }
    if (options?.chunkSize) params.chunkSize = options.chunkSize
    if (options?.chunkOverlap) params.chunkOverlap = options.chunkOverlap

    const res = await HttpUtil.getInstance().post<TApiResponse<IKnowledgeDocDto>>(
      '/Knowledge/UploadDocument',
      formData,
      {
        params,
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )
    return res.data
  }

  static async getDocumentChunks(documentId: string): Promise<TApiResponse<IDocChunkDto[]>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<IDocChunkDto[]>>(
      '/Knowledge/GetDocumentChunks',
      { params: { documentId } },
    )
    return res.data
  }

  static async deleteDocument(documentId: string): Promise<TApiResponse<boolean>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<boolean>>(
      '/Knowledge/DeleteDocument',
      null,
      { params: { documentId } },
    )
    return res.data
  }

  static async search(data: {
    knowledgeBaseId: string
    query: string
    topK?: number
    threshold?: number
  }): Promise<TApiResponse<ISearchResultDto[]>> {
    const res = await HttpUtil.getInstance().post<TApiResponse<ISearchResultDto[]>>(
      '/Knowledge/Search',
      data,
    )
    return res.data
  }
}
