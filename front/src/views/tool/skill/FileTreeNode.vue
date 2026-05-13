<script setup lang="ts">
/**
 * Skill 文件目录树的递归节点。
 *
 * 拆成独立 SFC 是为了利用 Vue SFC 的组件自递归能力（filename 即 component name），
 * 避免在父组件里手写 h() / defineComponent 体外组件。
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
      :style="{ paddingLeft: `${12 + depth * 14}px` }"
      @click="handleClick"
    >
      <el-icon :size="14">
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
  gap: 6px;
  width: 100%;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--nf-text-body);
  font-family: var(--nf-font-mono);
  font-size: 12.5px;
  letter-spacing: 0.02em;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s, color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.03);
    color: var(--nf-text-primary);
  }

  &.is-dir {
    color: var(--nf-text-secondary);
  }

  &.is-selected {
    background: rgba(0, 255, 159, 0.08);
    color: var(--nf-accent);
    border-left: 2px solid var(--nf-accent);
    padding-left: calc(12px - 2px);
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
