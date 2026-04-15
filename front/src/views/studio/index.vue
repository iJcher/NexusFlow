<template>
  <div class="studio-page">
    <aside class="studio-sidebar">
      <button
        v-for="filter in filters"
        :key="filter.value"
        :class="['filter-item', { active: activeFilter === filter.value }]"
        @click="activeFilter = filter.value"
      >
        <el-icon :size="16"><component :is="filter.icon" /></el-icon>
        <span>{{ filter.label }}</span>
        <span class="filter-count">{{ getFilterCount(filter.value) }}</span>
      </button>
    </aside>

    <div class="studio-main">
      <div class="studio-header">
        <div>
          <h2 class="page-title">{{ t('studio.title') }}</h2>
          <p class="page-subtitle">{{ t('studio.subtitle') }}</p>
        </div>
        <div class="header-actions">
          <el-input
            v-model="searchQuery"
            :placeholder="t('studio.searchPlaceholder')"
            :prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-button type="primary" :icon="Plus" @click="showCreateDialog">
            {{ t('studio.createWorkflow') }}
          </el-button>
        </div>
      </div>

      <div class="card-grid" v-loading="loading">
        <div class="workflow-card create-card" @click="showCreateDialog">
          <el-icon :size="36" color="var(--nf-text-muted)"><Plus /></el-icon>
          <span class="create-label">{{ t('studio.createWorkflow') }}</span>
        </div>

        <div
          v-for="flow in filteredFlows"
          :key="flow.id"
          class="workflow-card"
          @click="openDesigner(flow)"
        >
          <div class="card-top">
            <el-tag :type="getTagType(flow.flowType)" size="small" effect="plain">
              {{ getFlowTypeLabel(flow.flowType) }}
            </el-tag>
            <el-dropdown trigger="click" @command="(cmd: string) => handleCardAction(cmd, flow)">
              <el-icon class="card-more" :size="16" @click.stop><MoreFilled /></el-icon>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="edit">
                    <el-icon><Edit /></el-icon>{{ t('studio.card.edit') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="copy">
                    <el-icon><DocumentCopy /></el-icon>{{ t('studio.card.copy') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="saveTemplate">
                    <el-icon><Files /></el-icon>{{ t('studio.saveAsTemplate') }}
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon><Delete /></el-icon>{{ t('studio.card.delete') }}
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>

          <h3 class="card-name">{{ flow.displayName || t('flowList.unnamedFlow') }}</h3>
          <p class="card-desc">{{ flow.description || t('flowList.noDescription') }}</p>
          <span class="card-time">{{ t('studio.card.lastModified') }} {{ formatDateTime(flow.lastModified) }}</span>
        </div>
      </div>

      <div v-if="!loading && filteredFlows.length === 0" class="empty-state">
        <el-empty :description="t('studio.emptyTitle')">
          <template #description>
            <p>{{ t('studio.emptyDesc') }}</p>
          </template>
        </el-empty>
      </div>
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="editingFlow ? t('flowList.editTitle', { type: '' }) : t('studio.createDialog.title')" width="520px" destroy-on-close>
      <div v-if="!editingFlow" class="create-source-tabs">
        <button type="button" :class="['source-tab', { active: createMode === 'blank' }]" @click="createMode = 'blank'">
          {{ t('studio.createDialog.fromBlank') }}
        </button>
        <button type="button" :class="['source-tab', { active: createMode === 'template' }]" @click="createMode = 'template'">
          {{ t('studio.createDialog.fromTemplate') }}
        </button>
      </div>

      <div v-if="createMode === 'blank' || editingFlow">
        <el-form :model="formData" label-position="top">
          <el-form-item v-if="!editingFlow" :label="t('studio.createDialog.selectType')">
            <div class="flow-type-selector">
              <button
                v-for="ft in flowTypes"
                :key="ft.value"
                type="button"
                :class="['type-btn', { active: formData.flowType === ft.value }]"
                @click="formData.flowType = ft.value"
              >
                <el-icon :size="18"><component :is="ft.icon" /></el-icon>
                {{ ft.label }}
              </button>
            </div>
          </el-form-item>
          <el-form-item :label="t('studio.createDialog.name')" required>
            <el-input v-model="formData.name" :placeholder="t('studio.createDialog.namePlaceholder')" />
          </el-form-item>
          <el-form-item :label="t('studio.createDialog.description')">
            <el-input v-model="formData.description" type="textarea" :rows="3" :placeholder="t('studio.createDialog.descPlaceholder')" />
          </el-form-item>
        </el-form>
      </div>

      <div v-if="createMode === 'template' && !editingFlow" class="template-list">
        <div
          v-for="tpl in availableTemplates"
          :key="tpl.id"
          :class="['template-card', { selected: selectedTemplateId === tpl.id }]"
          @click="selectTemplate(tpl)"
        >
          <el-tag :type="getTagType(tpl.flowType)" size="small" effect="plain">{{ getFlowTypeLabel(tpl.flowType) }}</el-tag>
          <h4>{{ tpl.name }}</h4>
          <p>{{ tpl.description }}</p>
        </div>
        <el-empty v-if="availableTemplates.length === 0" :description="t('templates.emptyOfficial')" class="template-empty" />
      </div>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveFlow">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, markRaw } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Edit, Delete, DocumentCopy, Files, MoreFilled, Grid, MagicStick, Share, CircleCheck } from '@element-plus/icons-vue'
import { FlowService } from '@/services/flow.service'
import { FlowType, type IFlowDto } from '@/types/flow.types'

const { t } = useI18n()
const router = useRouter()

const allFlows = ref<IFlowDto[]>([])
const loading = ref(false)
const searchQuery = ref('')
const activeFilter = ref('all')
const dialogVisible = ref(false)
const editingFlow = ref<IFlowDto | null>(null)
const createMode = ref<'blank' | 'template'>('blank')
const selectedTemplateId = ref<string | null>(null)

const formData = ref({
  name: '',
  description: '',
  flowType: FlowType.AIFlow
})

const normalizeFlowType = (ft: any): FlowType => {
  if (ft === FlowType.AIFlow || ft === 'AIFlow' || ft === 1) return FlowType.AIFlow
  if (ft === FlowType.ApprovalFlow || ft === 'ApprovalFlow' || ft === 2) return FlowType.ApprovalFlow
  return FlowType.LogicFlow
}

const filters = computed(() => [
  { value: 'all', label: t('studio.all'), icon: markRaw(Grid) },
  { value: 'ai', label: t('nav.aiFlow'), icon: markRaw(MagicStick) },
  { value: 'logic', label: t('nav.logicFlow'), icon: markRaw(Share) },
  { value: 'approval', label: t('nav.approvalFlow'), icon: markRaw(CircleCheck) },
])

const flowTypes = computed(() => [
  { value: FlowType.AIFlow, label: t('nav.aiFlow'), icon: markRaw(MagicStick) },
  { value: FlowType.LogicFlow, label: t('nav.logicFlow'), icon: markRaw(Share) },
  { value: FlowType.ApprovalFlow, label: t('nav.approvalFlow'), icon: markRaw(CircleCheck) },
])

interface TemplateItem {
  id: string
  name: string
  description: string
  flowType: FlowType
  configInfoForRun?: any
  configInfoForWeb?: string
}

const availableTemplates = computed<TemplateItem[]>(() => {
  const officialRaw = localStorage.getItem('nf_official_templates')
  const myRaw = localStorage.getItem('nf_my_templates')
  const official: TemplateItem[] = officialRaw ? JSON.parse(officialRaw) : []
  const my: TemplateItem[] = myRaw ? JSON.parse(myRaw) : []
  return [...official, ...my]
})

const filteredFlows = computed(() => {
  let list = allFlows.value
  if (activeFilter.value !== 'all') {
    const typeMap: Record<string, FlowType> = {
      ai: FlowType.AIFlow,
      logic: FlowType.LogicFlow,
      approval: FlowType.ApprovalFlow,
    }
    const target = typeMap[activeFilter.value]
    list = list.filter(f => normalizeFlowType(f.flowType) === target)
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    list = list.filter(f =>
      (f.displayName || '').toLowerCase().includes(q) ||
      (f.description || '').toLowerCase().includes(q)
    )
  }
  return list
})

const getFilterCount = (filter: string) => {
  if (filter === 'all') return allFlows.value.length
  const typeMap: Record<string, FlowType> = {
    ai: FlowType.AIFlow,
    logic: FlowType.LogicFlow,
    approval: FlowType.ApprovalFlow,
  }
  const target = typeMap[filter]
  return allFlows.value.filter(f => normalizeFlowType(f.flowType) === target).length
}

const getTagType = (flowType?: FlowType | any) => {
  const ft = normalizeFlowType(flowType)
  if (ft === FlowType.AIFlow) return 'warning'
  if (ft === FlowType.ApprovalFlow) return 'success'
  return '' as const
}

const getFlowTypeLabel = (flowType?: FlowType | any) => {
  const ft = normalizeFlowType(flowType)
  if (ft === FlowType.AIFlow) return t('nav.aiFlow')
  if (ft === FlowType.ApprovalFlow) return t('nav.approvalFlow')
  return t('nav.logicFlow')
}

const getDesignerRoute = (flowType?: FlowType | any) => {
  const ft = normalizeFlowType(flowType)
  if (ft === FlowType.AIFlow) return 'ai'
  if (ft === FlowType.ApprovalFlow) return 'approval'
  return 'logic'
}

const loadAllFlows = async () => {
  try {
    loading.value = true
    const response = await FlowService.getFlowList({ pageIndex: 1, pageSize: 999 })
    if (response.errCode === 0 && response.data) {
      allFlows.value = response.data
    }
  } catch (error) {
    console.error('Failed to load flows:', error)
    ElMessage.error(t('flowList.loadFailed', { type: '' }))
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  editingFlow.value = null
  createMode.value = 'blank'
  selectedTemplateId.value = null
  formData.value = { name: '', description: '', flowType: FlowType.AIFlow }
  dialogVisible.value = true
}

const selectTemplate = (tpl: TemplateItem) => {
  selectedTemplateId.value = tpl.id
  formData.value.name = tpl.name
  formData.value.description = tpl.description
  formData.value.flowType = tpl.flowType
}

const saveFlow = async () => {
  if (!formData.value.name) {
    ElMessage.warning(t('studio.createDialog.nameRequired'))
    return
  }
  try {
    if (editingFlow.value && editingFlow.value.id) {
      const response = await FlowService.updateFlow({
        id: editingFlow.value.id,
        displayName: formData.value.name,
        description: formData.value.description,
      })
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.updateSuccess', { type: '' }))
        await loadAllFlows()
      } else {
        ElMessage.error(response.errMsg || t('flowList.updateFailed', { type: '' }))
        return
      }
    } else {
      const selectedTpl = createMode.value === 'template'
        ? availableTemplates.value.find(t => t.id === selectedTemplateId.value)
        : null

      const response = await FlowService.createFlow({
        displayName: formData.value.name,
        flowType: formData.value.flowType,
        description: formData.value.description,
        configInfoForRun: selectedTpl?.configInfoForRun ?? undefined,
        configInfoForWeb: selectedTpl?.configInfoForWeb ?? undefined,
      })
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.createSuccess', { type: '' }))
        await loadAllFlows()
      } else {
        ElMessage.error(response.errMsg || t('flowList.createFailed', { type: '' }))
        return
      }
    }
    dialogVisible.value = false
  } catch (error) {
    console.error('Failed to save flow:', error)
    ElMessage.error(t('flowList.createFailed', { type: '' }))
  }
}

const openDesigner = (flow: IFlowDto) => {
  if (!flow.id) return
  router.push(`/designer/${getDesignerRoute(flow.flowType)}/${flow.id}`)
}

const handleCardAction = async (cmd: string, flow: IFlowDto) => {
  if (cmd === 'edit') {
    editingFlow.value = flow
    createMode.value = 'blank'
    formData.value = {
      name: flow.displayName || '',
      description: flow.description || '',
      flowType: flow.flowType || FlowType.AIFlow,
    }
    dialogVisible.value = true
  } else if (cmd === 'copy') {
    try {
      const response = await FlowService.createFlow({
        displayName: `${flow.displayName || t('flowList.unnamedFlow')} - ${t('flowList.copySuffix')}`,
        flowType: flow.flowType || FlowType.LogicFlow,
        description: flow.description ?? undefined,
        configInfoForRun: flow.configInfoForRun ?? undefined,
        configInfoForWeb: flow.configInfoForWeb ?? undefined,
      })
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.copySuccess', { type: '' }))
        await loadAllFlows()
      }
    } catch {
      ElMessage.error(t('flowList.copyFailed', { type: '' }))
    }
  } else if (cmd === 'saveTemplate') {
    saveAsTemplate(flow)
  } else if (cmd === 'delete') {
    ElMessageBox.confirm(
      t('flowList.deleteConfirm', { name: flow.displayName }),
      t('flowList.deleteHint'),
      { type: 'warning' }
    ).then(async () => {
      if (!flow.id) return
      try {
        const response = await FlowService.deleteFlow(flow.id)
        if (response.errCode === 0) {
          ElMessage.success(t('flowList.deleteSuccess', { type: '' }))
          await loadAllFlows()
        }
      } catch {
        ElMessage.error(t('flowList.deleteFailed', { type: '' }))
      }
    }).catch(() => {})
  }
}

const saveAsTemplate = (flow: IFlowDto) => {
  const myRaw = localStorage.getItem('nf_my_templates')
  const my: TemplateItem[] = myRaw ? JSON.parse(myRaw) : []
  my.push({
    id: `my_${Date.now()}`,
    name: flow.displayName || t('flowList.unnamedFlow'),
    description: flow.description || '',
    flowType: flow.flowType || FlowType.LogicFlow,
    configInfoForRun: flow.configInfoForRun,
    configInfoForWeb: flow.configInfoForWeb,
  })
  localStorage.setItem('nf_my_templates', JSON.stringify(my))
  ElMessage.success(t('studio.saveAsTemplateSuccess'))
}

const formatDateTime = (dateStr?: string | null) => {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  loadAllFlows()
})
</script>

<style scoped>
.studio-page {
  display: flex;
  height: 100%;
}

/* ── Sidebar filter ── */
.studio-sidebar {
  width: 180px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 24px 12px;
  border-right: 1px solid var(--nf-border);
  background: var(--nf-bg-card);
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--nf-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.filter-item:hover {
  background: var(--nf-bg-elevated);
  color: var(--nf-text-primary);
}

.filter-item.active {
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
}

.filter-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--nf-text-muted);
  min-width: 20px;
  text-align: right;
}

/* ── Main area ── */
.studio-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.studio-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  color: var(--nf-text-primary);
}

.page-subtitle {
  font-size: 14px;
  color: var(--nf-text-muted);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 240px;
}

/* ── Card grid ── */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.workflow-card {
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  min-height: 160px;
}

.workflow-card:hover {
  border-color: var(--nf-accent-muted);
  transform: translateY(-3px);
  box-shadow: var(--nf-shadow-lg);
}

.create-card {
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-style: dashed;
  border-width: 2px;
}

.create-card:hover {
  border-color: var(--nf-accent);
}

.create-label {
  font-size: 14px;
  color: var(--nf-text-muted);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.card-more {
  color: var(--nf-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
}

.card-more:hover {
  color: var(--nf-text-primary);
  background: var(--nf-bg-elevated);
}

.card-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--nf-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  font-size: 13px;
  color: var(--nf-text-secondary);
  margin: 0 0 auto;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-time {
  font-size: 12px;
  color: var(--nf-text-muted);
  margin-top: 12px;
}

/* ── Dialog ── */
.create-source-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  overflow: hidden;
}

.source-tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: var(--nf-text-secondary);
  transition: all 0.15s;
}

.source-tab.active {
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
}

.source-tab:not(:last-child) {
  border-right: 1px solid var(--nf-border);
}

.flow-type-selector {
  display: flex;
  gap: 8px;
  width: 100%;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  background: transparent;
  color: var(--nf-text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}

.type-btn:hover {
  border-color: var(--nf-accent);
}

.type-btn.active {
  border-color: var(--nf-accent);
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
}

.template-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
}

.template-card {
  padding: 16px;
  border: 1px solid var(--nf-border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.template-card:hover {
  border-color: var(--nf-accent-muted);
}

.template-card.selected {
  border-color: var(--nf-accent);
  background: var(--nf-accent-muted);
}

.template-card h4 {
  margin: 8px 0 4px;
  font-size: 14px;
  color: var(--nf-text-primary);
}

.template-card p {
  margin: 0;
  font-size: 12px;
  color: var(--nf-text-secondary);
  line-height: 1.4;
}

.template-empty {
  grid-column: 1 / -1;
}

.empty-state {
  padding: 60px 0;
  text-align: center;
}
</style>
