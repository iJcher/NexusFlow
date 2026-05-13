<script setup lang="ts">
/**
 * Skill Detail Page —— GitHub-style file viewer.
 *
 * 设计目的：
 * - 替代之前 tool/skill 列表里的 el-drawer，给 skill 一个独立的"仓库浏览页"
 * - 左侧目录树（path 字符串扁平列表 → 树形结构）
 * - 右侧选中文件的内容渲染（.md 走 marked，其他文件走 <pre>）
 * - 顶部操作栏：返回 / 复制当前文件 / 下载整个 skill / 删除
 */
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft, Delete, Document as DocIcon, DocumentCopy, Download, Folder,
} from '@element-plus/icons-vue'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { SkillService, type ISkillDto } from '@/services/skill.service'
import FileTreeNode, { type IFileTreeNode } from './FileTreeNode.vue'

const route = useRoute()
const router = useRouter()

const skill = ref<ISkillDto | null>(null)
const loading = ref<boolean>(false)
const selectedPath = ref<string>('')
const expandedDirs = ref<Set<string>>(new Set())

const fileEntries = computed<Array<[string, string]>>(() => {
  if (!skill.value?.files) return []
  return Object.entries(skill.value.files)
})

const totalChars = computed<number>(() =>
  fileEntries.value.reduce((sum, [, content]) => sum + (content?.length || 0), 0),
)

const tree = computed<IFileTreeNode[]>(() => buildTree(fileEntries.value.map(([path]) => path)))

const selectedContent = computed<string>(() => {
  if (!selectedPath.value || !skill.value?.files) return ''
  return skill.value.files[selectedPath.value] || ''
})

const isMarkdown = computed<boolean>(() =>
  selectedPath.value.toLowerCase().endsWith('.md')
  || selectedPath.value.toLowerCase().endsWith('.markdown'),
)

const renderedHtml = computed<string>(() => {
  if (!isMarkdown.value || !selectedContent.value) return ''
  const html = marked(selectedContent.value, { breaks: true }) as string
  return DOMPurify.sanitize(html)
})

/**
 * 把扁平 path 列表（如 ["SKILL.md", "references/workflow.md"]）转成树。
 * 目录节点递归构造，叶子节点 isDir=false。
 */
function buildTree(paths: string[]): IFileTreeNode[] {
  const root: IFileTreeNode = { name: '', path: '', isDir: true, children: [] }
  for (const fullPath of paths) {
    const segments = fullPath.split('/').filter(Boolean)
    let cursor = root
    segments.forEach((seg, idx) => {
      const isLast = idx === segments.length - 1
      const path = segments.slice(0, idx + 1).join('/')
      let next = cursor.children.find(n => n.name === seg && n.isDir === !isLast)
      if (!next) {
        next = { name: seg, path, isDir: !isLast, children: [] }
        cursor.children.push(next)
      }
      cursor = next
    })
  }
  sortTree(root)
  return root.children
}

function sortTree(node: IFileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  node.children.forEach(sortTree)
}

const handleNodeClick = (node: IFileTreeNode): void => {
  if (node.isDir) {
    if (expandedDirs.value.has(node.path)) expandedDirs.value.delete(node.path)
    else expandedDirs.value.add(node.path)
    return
  }
  selectedPath.value = node.path
}

const loadSkill = async (): Promise<void> => {
  const id = route.params.id as string
  if (!id) {
    ElMessage.error('缺少 Skill ID')
    return
  }
  loading.value = true
  try {
    const response = await SkillService.getDetail(id)
    if (response.errCode === 0 && response.data) {
      skill.value = response.data
      autoExpandAll()
      autoSelectFirstFile()
    }
    else {
      ElMessage.error(response.errMsg || 'Skill 不存在')
      router.replace('/tool/skill')
    }
  }
  catch (error) {
    console.error('Load skill detail failed:', error)
    ElMessage.error('加载 Skill 详情失败')
    router.replace('/tool/skill')
  }
  finally {
    loading.value = false
  }
}

/** skill 通常文件少，全部目录默认展开比折叠更直观 */
const autoExpandAll = (): void => {
  const collect = (nodes: IFileTreeNode[]): void => {
    for (const n of nodes) {
      if (n.isDir) {
        expandedDirs.value.add(n.path)
        collect(n.children)
      }
    }
  }
  collect(tree.value)
}

/** 默认选中 SKILL.md，否则第一个文件 */
const autoSelectFirstFile = (): void => {
  if (!skill.value?.files) return
  if (skill.value.files['SKILL.md']) {
    selectedPath.value = 'SKILL.md'
    return
  }
  const firstFile = Object.keys(skill.value.files)[0]
  if (firstFile) selectedPath.value = firstFile
}

const goBack = (): void => {
  router.push('/tool/skill')
}

const downloadSkill = async (): Promise<void> => {
  if (!skill.value) return
  try {
    await SkillService.downloadAsZip(skill.value)
    ElMessage.success('下载已开始')
  }
  catch (error) {
    console.error('Download skill failed:', error)
    ElMessage.error('打包下载失败')
  }
}

const copyCurrentFile = async (): Promise<void> => {
  if (!selectedContent.value) return
  try {
    await navigator.clipboard.writeText(selectedContent.value)
    ElMessage.success(`已复制 ${selectedPath.value}`)
  }
  catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

const deleteSkill = async (): Promise<void> => {
  if (!skill.value) return
  await ElMessageBox.confirm(
    `确认删除 Skill「${skill.value.name}」？`,
    '删除 Skill',
    { type: 'warning' },
  )
  const res = await SkillService.delete(skill.value.id)
  if (res.errCode === 0) {
    ElMessage.success('Skill 已删除')
    router.push('/tool/skill')
  }
}

onMounted(loadSkill)
</script>

<template>
  <div v-loading="loading" class="skill-detail-page">
    <header class="detail-header">
      <div class="left-meta">
        <button class="ghost-btn" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
          <span>返回</span>
        </button>
        <div v-if="skill" class="title-block">
          <p class="breadcrumb">
            TOOL · SKILL · <span>{{ skill.name }}</span>
          </p>
          <h2>{{ skill.name }}</h2>
          <p class="desc">{{ skill.description || '暂无描述' }}</p>
        </div>
      </div>
      <div v-if="skill" class="right-actions">
        <button class="ghost-btn" :disabled="!selectedContent" @click="copyCurrentFile">
          <el-icon><DocumentCopy /></el-icon>
          复制当前文件
        </button>
        <button class="ghost-btn primary" @click="downloadSkill">
          <el-icon><Download /></el-icon>
          下载 ZIP
        </button>
        <button class="ghost-btn danger" @click="deleteSkill">
          <el-icon><Delete /></el-icon>
          删除
        </button>
      </div>
    </header>

    <section v-if="skill" class="meta-strip">
      <span>v{{ skill.version }}</span>
      <span class="dot" />
      <span>{{ skill.modelName || '未知模型' }}</span>
      <span class="dot" />
      <span>{{ fileEntries.length }} files · {{ totalChars }} chars</span>
      <span class="dot" />
      <span>更新于 {{ new Date(skill.updatedAt).toLocaleString() }}</span>
    </section>

    <section v-if="skill" class="repo-body">
      <aside class="file-tree">
        <div class="tree-header">
          <el-icon><Folder /></el-icon>
          <span>{{ skill.name }}</span>
        </div>
        <ul class="tree-root">
          <FileTreeNode
            v-for="node in tree"
            :key="node.path"
            :node="node"
            :selected-path="selectedPath"
            :expanded-dirs="expandedDirs"
            :depth="0"
            @click-node="handleNodeClick"
          />
        </ul>
      </aside>

      <main class="file-viewer">
        <div v-if="selectedPath" class="file-tab">
          <el-icon><DocIcon /></el-icon>
          <span>{{ selectedPath }}</span>
          <span class="size">{{ selectedContent.length }} chars</span>
        </div>
        <div v-if="!selectedPath" class="empty-hint">
          请在左侧选择一个文件
        </div>
        <article v-else-if="isMarkdown" class="md-content" v-html="renderedHtml" />
        <pre v-else class="raw-content">{{ selectedContent }}</pre>
      </main>
    </section>
  </div>
</template>

<style scoped lang="scss">
.skill-detail-page {
  min-height: 100%;
  padding: 24px 32px;
  background:
    radial-gradient(circle, rgba(0, 255, 159, 0.03) 0.5px, transparent 0.5px),
    var(--nf-bg-base);
  background-size: 20px 20px;
  font-family: var(--nf-font-display);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 20px 24px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: var(--nf-bg-surface-alpha);

  .left-meta {
    display: flex;
    gap: 18px;
    align-items: flex-start;
  }

  .title-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .breadcrumb {
    margin: 0;
    color: var(--nf-text-secondary);
    font-size: 11px;
    letter-spacing: 0.12em;

    span {
      color: var(--nf-accent);
    }
  }

  h2 {
    margin: 0;
    color: var(--nf-text-primary);
    font-size: 20px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .desc {
    margin: 0;
    color: var(--nf-text-body);
    font-size: 13px;
    line-height: 1.6;
    max-width: 640px;
  }

  .right-actions {
    display: flex;
    gap: 10px;
    flex-shrink: 0;
  }
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: transparent;
  color: var(--nf-text-body);
  font-family: var(--nf-font-display);
  font-size: 12px;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color 0.2s, color 0.2s, background 0.2s;

  &:hover:not(:disabled) {
    border-color: rgba(0, 255, 159, 0.4);
    color: var(--nf-accent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.primary {
    border-color: rgba(0, 255, 159, 0.4);
    color: var(--nf-accent);

    &:hover {
      background: rgba(0, 255, 159, 0.08);
      box-shadow: 0 0 12px rgba(0, 255, 159, 0.2);
    }
  }

  &.danger:hover {
    border-color: rgba(255, 99, 99, 0.5);
    color: #ff7878;
    background: rgba(255, 99, 99, 0.06);
  }
}

.meta-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.015);
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-mono);
  font-size: 12px;
  letter-spacing: 0.04em;

  .dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
  }
}

.repo-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

.file-tree {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-surface-alpha);
  overflow: hidden;

  .tree-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    color: var(--nf-text-primary);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .tree-root {
    list-style: none;
    margin: 0;
    padding: 8px 0;
    overflow-y: auto;
    flex: 1;
  }
}

.file-viewer {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-surface-alpha);
  overflow: hidden;
  min-height: 0;

  .file-tab {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.02);
    color: var(--nf-text-body);
    font-family: var(--nf-font-mono);
    font-size: 12px;
    letter-spacing: 0.04em;

    .size {
      margin-left: auto;
      color: var(--nf-text-secondary);
      font-size: 11px;
    }
  }

  .empty-hint {
    padding: 60px 0;
    text-align: center;
    color: var(--nf-text-secondary);
    font-size: 13px;
  }

  .raw-content,
  .md-content {
    flex: 1;
    margin: 0;
    padding: 24px 32px;
    overflow: auto;
    color: var(--nf-text-body);
    font-size: 13px;
    line-height: 1.75;
  }

  .raw-content {
    font-family: var(--nf-font-mono);
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--nf-text-primary);
    font-size: 12.5px;
  }
}

.md-content {
  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    color: var(--nf-text-primary);
    margin: 1.4em 0 0.6em;
    line-height: 1.3;
    letter-spacing: 0.04em;
  }

  :deep(h1) {
    font-size: 22px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 8px;
  }

  :deep(h2) {
    font-size: 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-bottom: 6px;
  }

  :deep(h3) {
    font-size: 15px;
  }

  :deep(p) {
    margin: 0.8em 0;
    color: var(--nf-text-body);
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 1.6em;
    margin: 0.6em 0;

    li {
      margin: 0.25em 0;
    }
  }

  :deep(code) {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 255, 159, 0.08);
    color: var(--nf-accent);
    font-family: var(--nf-font-mono);
    font-size: 12px;
  }

  :deep(pre) {
    margin: 1em 0;
    padding: 14px 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 8px;
    background: var(--nf-bg-base);
    overflow-x: auto;

    code {
      padding: 0;
      background: transparent;
      color: var(--nf-text-primary);
      font-size: 12px;
    }
  }

  :deep(blockquote) {
    border-left: 3px solid rgba(0, 255, 159, 0.4);
    margin: 1em 0;
    padding: 6px 14px;
    color: var(--nf-text-secondary);
    background: rgba(0, 255, 159, 0.03);
  }

  :deep(hr) {
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 2em 0;
  }

  :deep(a) {
    color: var(--nf-accent);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;

    th,
    td {
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.03);
      color: var(--nf-text-primary);
    }
  }
}

::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 255, 159, 0.3);
}
</style>
