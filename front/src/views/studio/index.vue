<template>
  <div class="studio-page">
    <!-- HUD sidebar -->
    <aside class="studio-sidebar">
      <div class="sidebar-label">SYSTEM FILTERS</div>
      <button
        v-for="filter in filters"
        :key="filter.value"
        :class="['filter-item', { active: activeFilter === filter.value }]"
        @click="activeFilter = filter.value"
      >
        <el-icon :size="14"><component :is="filter.icon" /></el-icon>
        <span>{{ filter.label }}</span>
        <span class="filter-count">{{ getFilterCount(filter.value) }}</span>
      </button>
    </aside>

    <div class="studio-main">
      <div class="studio-header">
        <div>
          <h2 class="page-title">WORKFLOWS</h2>
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
          <button class="fui-btn fui-btn--primary" @click="showCreateDialog">
            <span class="fui-btn-icon">+</span>
            {{ t('studio.createWorkflow') }}
          </button>
        </div>
      </div>

      <div class="card-grid" v-loading="loading">
        <div class="workflow-card create-card" @click="showCreateDialog">
          <div class="create-icon-ring">
            <el-icon :size="28"><Plus /></el-icon>
          </div>
          <span class="create-label">CREATE NEW WORKFLOW</span>
        </div>

        <div
          v-for="flow in filteredFlows"
          :key="flow.id"
          class="workflow-card"
          @click="openDesigner(flow)"
        >
          <div class="card-top">
            <span class="fui-tag" :class="'fui-tag--' + getDesignerRoute(flow.flowType)">
              {{ getFlowTypeLabel(flow.flowType) }}
            </span>
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
          <div class="card-footer">
            <span class="card-time">{{ formatDateTime(flow.lastModified) }}</span>
          </div>
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
    <el-dialog v-model="dialogVisible" :title="editingFlow ? t('flowList.editTitle', { type: '' }) : t('studio.createDialog.title')" width="520px" destroy-on-close class="fui-dialog">
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
          <span class="fui-tag" :class="'fui-tag--' + getDesignerRoute(tpl.flowType)">{{ getFlowTypeLabel(tpl.flowType) }}</span>
          <h4>{{ tpl.name }}</h4>
          <p>{{ tpl.description }}</p>
        </div>
        <el-empty v-if="availableTemplates.length === 0" :description="t('templates.emptyOfficial')" class="template-empty" />
      </div>

      <template #footer>
        <div class="fui-dialog-footer">
          <button class="fui-btn fui-btn--ghost" @click="dialogVisible = false">{{ t('common.cancel') }}</button>
          <button class="fui-btn fui-btn--primary" @click="saveFlow">{{ t('common.confirm') }}</button>
        </div>
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
  background:
    radial-gradient(circle, rgba(0, 255, 159, 0.03) 0.5px, transparent 0.5px),
    #05070A;
  background-size: 20px 20px;
  font-family: var(--nf-font-display);
}

/* ── Sidebar ── */
.studio-sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 32px 12px;
  border-right: 1px solid #141A22;
  background: rgba(8, 11, 16, 0.6);
}

.sidebar-label {
  font-family: var(--nf-font-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.18em;
  color: rgba(0, 255, 159, 0.35);
  padding: 0 12px 16px;
  margin-bottom: 8px;
  border-bottom: 1px solid #141A22;
  text-transform: uppercase;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #6B7D8E;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  width: 100%;
  text-align: left;
  position: relative;
}

.filter-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 2px;
  border-radius: 1px;
  background: transparent;
  transition: all 0.2s;
}

.filter-item:hover {
  color: #B0BEC5;
  background: rgba(255, 255, 255, 0.02);
}

.filter-item.active {
  color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.04);
}

.filter-item.active::before {
  background: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
}

.filter-count {
  margin-left: auto;
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #3A4E5E;
  min-width: 20px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.filter-item.active .filter-count {
  color: rgba(0, 255, 159, 0.5);
}

/* ── Main area ── */
.studio-main {
  flex: 1;
  padding: 32px 40px;
  overflow-y: auto;
}

.studio-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32px;
  gap: 16px;
  flex-wrap: wrap;
}

.page-title {
  font-family: var(--nf-font-display);
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 6px;
  color: #E6EDF3;
  letter-spacing: 0.08em;
}

.page-subtitle {
  font-family: var(--nf-font-display);
  font-size: 13px;
  color: #6B7D8E;
  margin: 0;
  font-weight: 400;
  letter-spacing: 0.04em;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-input {
  width: 260px;
}

/* ── FUI Button ── */
.fui-btn {
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 9px 22px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.fui-btn--primary {
  background: transparent;
  color: var(--nf-accent);
  border: 1px solid var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
}

.fui-btn--primary:hover {
  background: rgba(0, 255, 159, 0.06);
  box-shadow: var(--nf-glow-md);
}

.fui-btn--ghost {
  background: transparent;
  color: #6B7D8E;
  border: 1px solid #1E2733;
}

.fui-btn--ghost:hover {
  border-color: rgba(0, 255, 159, 0.2);
  color: #B0BEC5;
}

.fui-btn-icon {
  font-size: 16px;
  line-height: 1;
}

/* ── Card grid ── */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 16px;
}

.workflow-card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 160px;
  position: relative;
}

.workflow-card:hover {
  border-color: rgba(0, 255, 159, 0.4);
  box-shadow: 0 0 16px rgba(0, 255, 159, 0.12), 0 0 32px rgba(0, 255, 159, 0.04);
}

/* ── Create card ── */
.create-card {
  align-items: center;
  justify-content: center;
  gap: 16px;
  border-style: dashed;
  border-color: #1A2030;
  background: transparent;
}

.create-card:hover {
  border-color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.02);
}

.create-icon-ring {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid #1E2733;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4A5C6E;
  transition: all 0.3s;
}

.create-card:hover .create-icon-ring {
  border-color: var(--nf-accent);
  color: var(--nf-accent);
  box-shadow: var(--nf-glow-md);
}

.create-label {
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 500;
  color: #4A5C6E;
  letter-spacing: 0.06em;
}

.create-card:hover .create-label {
  color: rgba(0, 255, 159, 0.6);
}

/* ── FUI Tag ── */
.fui-tag {
  font-family: var(--nf-font-display);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 3px 10px;
  border-radius: 3px;
  border: 1px solid;
  background: transparent;
}

.fui-tag--ai {
  color: #fbbf24;
  border-color: rgba(251, 191, 36, 0.25);
}

.fui-tag--logic {
  color: var(--nf-accent);
  border-color: rgba(0, 255, 159, 0.25);
}

.fui-tag--approval {
  color: #34d399;
  border-color: rgba(52, 211, 153, 0.25);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.card-more {
  color: #3A4E5E;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.15s;
}

.card-more:hover {
  color: var(--nf-accent);
}

.card-name {
  font-family: var(--nf-font-display);
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px;
  color: #E6EDF3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.06em;
}

.card-desc {
  font-family: var(--nf-font-display);
  font-size: 13px;
  color: #7A8B9C;
  margin: 0 0 auto;
  line-height: 1.7;
  letter-spacing: 0.02em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #141A22;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-time {
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #4A5C6E;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

/* ── Dialog ── */
.create-source-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 20px;
  border: 1px solid #1E2733;
  border-radius: 6px;
  overflow: hidden;
}

.source-tab {
  flex: 1;
  padding: 10px;
  border: none;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  color: #6B7D8E;
  transition: all 0.2s;
  letter-spacing: 0.03em;
}

.source-tab.active {
  background: rgba(0, 255, 159, 0.05);
  color: var(--nf-accent);
}

.source-tab:not(:last-child) {
  border-right: 1px solid #1E2733;
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
  border: 1px solid #1E2733;
  border-radius: 6px;
  background: transparent;
  color: #6B7D8E;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
  cursor: pointer;
  transition: all 0.2s;
}

.type-btn:hover {
  border-color: rgba(0, 255, 159, 0.25);
  color: #B0BEC5;
}

.type-btn.active {
  border-color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.04);
  color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);
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
  border: 1px solid #1A2030;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.template-card:hover {
  border-color: rgba(0, 255, 159, 0.2);
}

.template-card.selected {
  border-color: var(--nf-accent);
  background: rgba(0, 255, 159, 0.03);
  box-shadow: var(--nf-glow-sm);
}

.template-card h4 {
  margin: 10px 0 4px;
  font-family: var(--nf-font-display);
  font-size: 14px;
  font-weight: 600;
  color: #E6EDF3;
  letter-spacing: 0.04em;
}

.template-card p {
  margin: 0;
  font-family: var(--nf-font-display);
  font-size: 12px;
  color: #6B7D8E;
  line-height: 1.6;
  letter-spacing: 0.02em;
}

.template-empty {
  grid-column: 1 / -1;
}

.empty-state {
  padding: 80px 0;
  text-align: center;
}

.fui-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* ── Element Plus overrides ── */
:deep(.el-input__wrapper) {
  background: transparent;
  border: 1px solid #1E2733;
  border-radius: 4px;
  box-shadow: none !important;
  transition: border-color 0.2s;
}

:deep(.el-input__wrapper:hover) {
  border-color: #2A3544;
}

:deep(.el-input__wrapper.is-focus) {
  border-color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm) !important;
}

:deep(.el-input__inner) {
  font-family: var(--nf-font-display);
  font-size: 13px;
  color: #C0CDD8;
  letter-spacing: 0.02em;
}

:deep(.el-textarea__inner) {
  font-family: var(--nf-font-display);
  font-size: 13px;
  color: #C0CDD8;
  letter-spacing: 0.02em;
}

:deep(.el-input__inner::placeholder) {
  color: #4A5C6E;
}

:deep(.el-form-item__label) {
  font-family: var(--nf-font-display);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: #6B7D8E !important;
}

/* Dialog overrides */
:deep(.fui-dialog.el-dialog) {
  background: #080B10;
  border: 1px solid #1E2733;
  border-radius: 8px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

:deep(.fui-dialog .el-dialog__header) {
  padding: 18px 24px;
  border-bottom: 1px solid #141A22;
}

:deep(.fui-dialog .el-dialog__title) {
  font-family: var(--nf-font-display);
  font-size: 16px;
  font-weight: 700;
  color: #E6EDF3;
  letter-spacing: 0.06em;
}

:deep(.fui-dialog .el-dialog__body) {
  padding: 24px;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 4px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #1E2733;
  border-radius: 2px;
}
::-webkit-scrollbar-thumb:hover {
  background: #2A3544;
}
</style>
