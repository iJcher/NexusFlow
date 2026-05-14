<script setup lang="ts">
/**
 * Skill 文件目录树的递归节点。
 *
 * 设计协议遵循 nexus-dark-fui §1（Border-Driven）+ §5（Table Row hover left-bar）：
 * - 节点本身有一条 2px 占位的 border-left，default 是 transparent
 * - hover：border-left 变为 0.4 accent，bg 微亮 0.02 白
 * - selected：border-left 实色 accent，bg 0.08 accent-muted，文字 accent
 *
 * 拆成独立 SFC 是为了利用 SFC 文件名即组件名的特性，
 * 在模板里直接 <FileTreeNode /> 自递归，比 defineComponent + h() 写法更直观。
 */
import { computed } from 'vue'
import { Document, Folder, FolderOpened } from '@element-plus/icons-vue'

export interface IFileTreeNode {
  name: string
  path: string
  isDir: boolean
  children: IFileTreeNode[]
}

const props = defineProps<{
  node: IFileTreeNode
  selectedPath: string
  expandedDirs: Set<string>
  depth: number
}>()

const emit = defineEmits<{
  (e: 'click-node', node: IFileTreeNode): void
}>()

const isExpanded = computed<boolean>(() => props.expandedDirs.has(props.node.path))
const isSelected = computed<boolean>(() => !props.node.isDir && props.selectedPath === props.node.path)

const handleClick = (): void => {
  emit('click-node', props.node)
}

const onChildClick = (n: IFileTreeNode): void => {
  emit('click-node', n)
}
</script>

<template>
  <li class="tree-item">
    <button
      :class="['tree-node', { 'is-dir': node.isDir, 'is-selected': isSelected }]"
      :style="{ paddingLeft: `${10 + depth * 14}px` }"
      @click="handleClick"
    >
      <el-icon :size="13" class="tree-icon">
        <FolderOpened v-if="node.isDir && isExpanded" />
        <Folder v-else-if="node.isDir" />
        <Document v-else />
      </el-icon>
      <span class="name">{{ node.name }}</span>
    </button>
    <ul v-if="node.isDir && isExpanded" class="tree-children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :selected-path="selectedPath"
        :expanded-dirs="expandedDirs"
        :depth="depth + 1"
        @click-node="onChildClick"
      />
    </ul>
  </li>
</template>

<style scoped lang="scss">
/* §5 Table Row hover 模式：默认透明左条，hover/selected 替换为 accent */
.tree-item {
  list-style: none;
  margin: 0;
}

.tree-children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-mono);
  font-size: 12.5px;
  letter-spacing: 0.02em;
  line-height: 1.4;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.02);
    border-left-color: rgba(0, 255, 159, 0.4);
    color: #B0BEC5;
  }

  /* §3 Label 风格：目录名稍弱化，文件名走 body 默认 */
  &.is-dir {
    color: var(--nf-text-muted);

    &:hover {
      color: var(--nf-text-secondary);
    }
  }

  &.is-selected {
    background: var(--nf-accent-muted);
    border-left-color: var(--nf-accent);
    color: var(--nf-accent);
  }

  .tree-icon {
    flex-shrink: 0;
    opacity: 0.85;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
