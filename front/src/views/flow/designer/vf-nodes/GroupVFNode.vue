<template>
  <div
    class="vf-group-node"
    :class="{ selected: props.selected }"
    :style="groupStyle"
  >
    <div class="group-toolbar nodrag nopan">
      <input
        v-if="isEditing"
        ref="titleInputRef"
        class="group-title-input nodrag"
        :value="title"
        @input="handleTitleInput"
        @blur="commitEdit"
        @keydown.enter.prevent="commitEdit"
        @keydown.esc.prevent="cancelEdit"
      />
      <span v-else class="group-title-text" @dblclick.stop="startEdit">
        {{ title }}
      </span>
      <button class="group-delete-btn nodrag" title="删除 Group" @click.stop="handleDelete">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, inject } from 'vue'

const props = defineProps<{
  id: string
  data: Record<string, any>
  selected?: boolean
}>()

const deleteGroup = inject<(groupId: string) => void>('deleteGroup', () => {})

const title = ref(props.data?.title || 'Group')
const isEditing = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)
const editBuffer = ref('')

const groupStyle = computed(() => ({
  width: `${props.data?.width || 300}px`,
  height: `${props.data?.height || 200}px`,
}))

const startEdit = () => {
  editBuffer.value = title.value
  isEditing.value = true
  nextTick(() => titleInputRef.value?.focus())
}

const handleTitleInput = (e: Event) => {
  editBuffer.value = (e.target as HTMLInputElement).value
}

const commitEdit = () => {
  if (editBuffer.value.trim()) {
    title.value = editBuffer.value.trim()
  }
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
}

const handleDelete = () => {
  deleteGroup(props.id)
}
</script>

<style scoped>
.vf-group-node {
  position: relative;
  border: 1.5px dashed rgba(96, 165, 250, 0.4);
  background: rgba(59, 130, 246, 0.06);
  border-radius: 12px;
  min-width: 220px;
  min-height: 160px;
  box-sizing: border-box;
}

.vf-group-node.selected {
  border-color: rgba(96, 165, 250, 0.7);
  background: rgba(59, 130, 246, 0.1);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
}

.group-toolbar {
  position: absolute;
  top: -28px;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
}

.group-title-text {
  font-size: 11px;
  font-weight: 600;
  color: rgba(96, 165, 250, 0.8);
  cursor: default;
  user-select: none;
  padding: 2px 6px;
  border-radius: 4px;
}
.group-title-text:hover {
  background: rgba(59, 130, 246, 0.08);
}

.group-title-input {
  font-size: 11px;
  font-weight: 600;
  color: var(--nf-text-primary, #18181b);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  background: var(--nf-bg-card, #fff);
  width: 120px;
}
.group-title-input:focus {
  border-color: rgba(59, 130, 246, 0.7);
}

.group-delete-btn {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: #a1a1aa;
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.group-delete-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}
</style>
