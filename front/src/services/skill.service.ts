import JSZip from 'jszip'
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

export interface ISkillModelOption {
  key: string
  label: string
  modelName: string
  isDefault: boolean
  source: 'system' | 'user'
}

export class SkillService {
  static async generateFromFlow(data: {
    flowId: string
    name?: string
    description?: string
    modelKey?: string
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

  static async getDetail(id: string): Promise<TApiResponse<ISkillDto>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<ISkillDto>>(
      '/Skill/GetDetail',
      { params: { id } },
    )
    return res.data
  }

  static async getAvailableModels(): Promise<TApiResponse<ISkillModelOption[]>> {
    const res = await HttpUtil.getInstance().get<TApiResponse<ISkillModelOption[]>>(
      '/Skill/GetAvailableModels',
    )
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

  /**
   * 把 skill.files（path -> content）打包成 zip 触发浏览器下载。
   * zip 内部目录结构：
   *   {skill-name}/
   *     SKILL.md
   *     references/
   *       workflow.md
   * 这样解压后就是一个标准 Codex Skill 目录，可以直接拷到 ~/.codex/skills/ 下使用。
   */
  static async downloadAsZip(skill: ISkillDto): Promise<void> {
    const zip = new JSZip()
    const rootFolderName = (skill.name || 'skill').replace(/[^\w\-.]+/g, '-')
    const root = zip.folder(rootFolderName)
    if (!root) throw new Error('Failed to create root folder in zip')

    Object.entries(skill.files || {}).forEach(([path, content]) => {
      root.file(path, content ?? '')
    })

    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${rootFolderName}-v${skill.version || 1}.zip`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }
}
