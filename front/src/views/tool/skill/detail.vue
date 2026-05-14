<script setup lang="ts">
/**
 * Skill Detail Page —— GitHub-style file viewer.
 *
 * 设计协议：nexus-dark-fui §1（Border-Driven）+ §3（Typography）+ §5（Components）。
 * - Page bg：micro-dot grid（§5 Page）
 * - Header：surface-alpha card，主标题 H1 20-24px / 0.08em
 * - Meta strip：mono 字体的 metric chips（§5 Tag 透明底）
 * - Repo body：左 file tree（§5 Table Row 模式）+ 右 file viewer
 * - 所有可交互元素遵循 §4：hover 必须有边框颜色变化
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

const formattedUpdated = computed<string>(() => {
  if (!skill.value?.updatedAt) return '-'
  const d = new Date(skill.value.updatedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <el-icon :size="14"><ArrowLeft /></el-icon>
          <span>BACK</span>
        </button>
        <div v-if="skill" class="title-block">
          <p class="breadcrumb">
            TOOL <span class="bc-sep">/</span> SKILL <span class="bc-sep">/</span>
            <span class="bc-current">{{ skill.name }}</span>
          </p>
          <h1 class="skill-title">{{ skill.name }}</h1>
          <p class="skill-desc">{{ skill.description || '暂无描述' }}</p>
        </div>
      </div>
      <div v-if="skill" class="header-actions">
        <button class="fui-btn fui-btn--ghost" :disabled="!selectedContent" @click="copyCurrentFile">
          <el-icon :size="14"><DocumentCopy /></el-icon>
          复制当前文件
        </button>
        <button class="fui-btn fui-btn--primary" @click="downloadSkill">
          <el-icon :size="14"><Download /></el-icon>
          下载 ZIP
        </button>
        <button class="fui-btn fui-btn--danger" @click="deleteSkill">
          <el-icon :size="14"><Delete /></el-icon>
          删除
        </button>
      </div>
    </header>

    <section v-if="skill" class="meta-strip">
      <span class="fui-tag fui-tag--accent">v{{ skill.version }}</span>
      <span class="fui-tag fui-tag--neutral">{{ skill.modelName || 'unknown-model' }}</span>
      <span class="meta-chip">
        <span class="meta-chip__label">FILES</span>
        <span class="meta-chip__value">{{ fileEntries.length }}</span>
      </span>
      <span class="meta-chip">
        <span class="meta-chip__label">CHARS</span>
        <span class="meta-chip__value">{{ totalChars }}</span>
      </span>
      <span class="meta-chip">
        <span class="meta-chip__label">UPDATED</span>
        <span class="meta-chip__value">{{ formattedUpdated }}</span>
      </span>
    </section>

    <section v-if="skill" class="repo-body">
      <aside class="file-tree">
        <div class="tree-header">
          <el-icon :size="14"><Folder /></el-icon>
          <span class="tree-title">{{ skill.name }}</span>
          <span class="tree-count">{{ fileEntries.length }}</span>
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
          <el-icon :size="13"><DocIcon /></el-icon>
          <span class="file-tab__path">{{ selectedPath }}</span>
          <span class="file-tab__size">{{ selectedContent.length }} chars</span>
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
/* ─────────────────────────────────────────────
 * §5 Page bg：base + micro-dot grid overlay
 * ───────────────────────────────────────────── */
.skill-detail-page {
  min-height: 100%;
  padding: 28px 32px;
  background:
    radial-gradient(circle, var(--nf-grid-color) 0.5px, transparent 0.5px),
    var(--nf-bg-base);
  background-size: var(--nf-grid-size) var(--nf-grid-size);
  font-family: var(--nf-font-display);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─────────────────────────────────────────────
 * Header card —— surface-alpha + 0.06 边
 * ───────────────────────────────────────────── */
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 22px 26px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  min-width: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  margin-top: 4px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: transparent;
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease;

  &:hover {
    border-color: rgba(0, 255, 159, 0.35);
    color: var(--nf-accent);
  }
}

.title-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

/* §3 Label：12px / 600 / 0.08em / muted */
.breadcrumb {
  margin: 0;
  color: var(--nf-text-muted);
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 1.3;

  .bc-sep {
    margin: 0 6px;
    color: rgba(255, 255, 255, 0.15);
  }

  .bc-current {
    color: var(--nf-accent);
  }
}

/* §3 H1：20-24px / 600 / 0.08em / primary */
.skill-title {
  margin: 0;
  color: var(--nf-text-primary);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.4;
}

/* §3 Body：14px / 400 / 0.02em / secondary / lh 1.75 */
.skill-desc {
  margin: 0;
  color: var(--nf-text-secondary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.75;
  letter-spacing: 0.02em;
  max-width: 720px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* ─────────────────────────────────────────────
 * §5 Buttons —— outline-only，hover 边框色变化
 * ───────────────────────────────────────────── */
.fui-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.fui-btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--nf-text-secondary);

  &:hover:not(:disabled) {
    border-color: rgba(0, 255, 159, 0.35);
    color: #B0BEC5;
  }
}

.fui-btn--primary {
  border: 1px solid var(--nf-accent);
  color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);

  &:hover:not(:disabled) {
    border-color: var(--nf-accent-hover);
    color: var(--nf-accent-hover);
    background: rgba(0, 255, 159, 0.06);
    box-shadow: var(--nf-glow-md);
  }
}

.fui-btn--danger {
  border: 1px solid var(--nf-danger);
  color: var(--nf-danger);

  &:hover:not(:disabled) {
    border-color: #fca5a5;
    background: rgba(248, 113, 113, 0.06);
    box-shadow: 0 0 8px rgba(248, 113, 113, 0.2);
  }
}

/* ─────────────────────────────────────────────
 * Meta strip —— tags + metric chips（mono）
 * ───────────────────────────────────────────── */
.meta-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: var(--nf-bg-card-alpha);
}

.fui-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: border-color 0.2s ease;
}

.fui-tag--accent {
  border: 1px solid rgba(0, 255, 159, 0.25);
  color: var(--nf-accent);

  &:hover {
    border-color: rgba(0, 255, 159, 0.45);
  }
}

.fui-tag--neutral {
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--nf-text-secondary);

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
    color: #B0BEC5;
  }
}

.meta-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
  font-family: var(--nf-font-mono);

  &__label {
    color: var(--nf-text-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  &__value {
    color: var(--nf-text-primary);
    font-size: 13px;
    letter-spacing: 0.02em;
  }
}

/* ─────────────────────────────────────────────
 * Repo body —— left tree + right viewer
 * ───────────────────────────────────────────── */
.repo-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  min-height: 0;
}

/* ── File tree ── */
.file-tree {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
  overflow: hidden;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.1);
  }
}

.tree-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.015);
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;

  .tree-title {
    flex: 1;
    color: var(--nf-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tree-count {
    padding: 1px 7px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 9999px;
    color: var(--nf-text-muted);
    font-family: var(--nf-font-mono);
    font-size: 11px;
    letter-spacing: 0.04em;
  }
}

.tree-root {
  list-style: none;
  margin: 0;
  padding: 6px 0;
  overflow-y: auto;
  flex: 1;
}

/* ── File viewer ── */
.file-viewer {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
  overflow: hidden;
  min-height: 0;
  transition: border-color 0.2s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.1);
  }
}

.file-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-mono);
  font-size: 12px;
  letter-spacing: 0.02em;

  &__path {
    color: var(--nf-text-primary);
  }

  &__size {
    margin-left: auto;
    color: var(--nf-text-muted);
    font-size: 11px;
  }
}

.empty-hint {
  padding: 80px 0;
  text-align: center;
  color: var(--nf-text-muted);
  font-family: var(--nf-font-display);
  font-size: 13px;
  letter-spacing: 0.04em;
}

.raw-content,
.md-content {
  flex: 1;
  margin: 0;
  padding: 28px 36px;
  overflow: auto;
  color: var(--nf-text-secondary);
  font-size: 14px;
  line-height: 1.75;
  letter-spacing: 0.02em;
}

.raw-content {
  font-family: var(--nf-font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--nf-text-primary);
  font-size: 12.5px;
  line-height: 1.65;
}

/* ─────────────────────────────────────────────
 * Markdown rendered styles
 *  - 标题 primary、间距对齐
 *  - 代码块 base 底 + 0.06 边
 *  - 引用块用 accent-muted
 * ───────────────────────────────────────────── */
.md-content {
  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4) {
    color: var(--nf-text-primary);
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.06em;
  }

  :deep(h1) {
    margin: 0 0 0.6em;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 22px;
    letter-spacing: 0.08em;
  }

  :deep(h2) {
    margin: 1.5em 0 0.6em;
    padding-bottom: 6px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    font-size: 18px;
  }

  :deep(h3) {
    margin: 1.4em 0 0.5em;
    font-size: 15px;
  }

  :deep(h4) {
    margin: 1.2em 0 0.4em;
    font-size: 13px;
    color: var(--nf-text-secondary);
  }

  :deep(p) {
    margin: 0.8em 0;
    color: var(--nf-text-secondary);
  }

  :deep(strong) {
    color: var(--nf-text-primary);
    font-weight: 600;
  }

  :deep(em) {
    color: var(--nf-text-secondary);
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 1.6em;
    margin: 0.6em 0;

    li {
      margin: 0.3em 0;
      color: var(--nf-text-secondary);
    }
  }

  /* §6 inline code：accent-muted bg + accent text */
  :deep(code) {
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--nf-accent-muted);
    color: var(--nf-accent);
    font-family: var(--nf-font-mono);
    font-size: 12.5px;
    letter-spacing: 0.02em;
  }

  /* §5 pre code block：base bg + subtle border */
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
      font-size: 12.5px;
      line-height: 1.65;
    }
  }

  :deep(blockquote) {
    margin: 1em 0;
    padding: 8px 16px;
    border-left: 3px solid rgba(0, 255, 159, 0.4);
    background: rgba(0, 255, 159, 0.03);
    color: var(--nf-text-secondary);

    p {
      margin: 0.4em 0;
    }
  }

  :deep(hr) {
    border: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    margin: 2em 0;
  }

  :deep(a) {
    color: var(--nf-accent);
    text-decoration: none;
    transition: color 0.2s ease;

    &:hover {
      color: var(--nf-accent-hover);
      text-decoration: underline;
    }
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 13px;

    th,
    td {
      padding: 8px 12px;
      border: 1px solid rgba(255, 255, 255, 0.06);
      text-align: left;
    }

    /* §5 Table header */
    th {
      background: rgba(255, 255, 255, 0.03);
      color: var(--nf-text-muted);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    td {
      color: var(--nf-text-secondary);
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.015);
    }
  }
}

/* ─────────────────────────────────────────────
 * §5 Scrollbar：4px / track transparent / 0.08 thumb
 * ───────────────────────────────────────────── */
:deep(::-webkit-scrollbar),
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

:deep(::-webkit-scrollbar-track),
::-webkit-scrollbar-track {
  background: transparent;
}

:deep(::-webkit-scrollbar-thumb),
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

:deep(::-webkit-scrollbar-thumb:hover),
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* §7 reduced motion */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
