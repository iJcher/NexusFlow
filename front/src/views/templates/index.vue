<template>
  <div class="templates-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('templates.title') }}</h2>
        <p class="page-subtitle">{{ t('templates.subtitle') }}</p>
      </div>
    </div>

    <div class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'official' }]" @click="activeTab = 'official'">
        {{ t('templates.official') }}
      </button>
      <button :class="['tab-btn', { active: activeTab === 'my' }]" @click="activeTab = 'my'">
        {{ t('templates.myTemplates') }}
        <span v-if="myTemplates.length" class="tab-badge">{{ myTemplates.length }}</span>
      </button>
    </div>

    <!-- Official Templates -->
    <div v-if="activeTab === 'official'" class="template-grid">
      <div v-for="tpl in officialTemplates" :key="tpl.id" class="template-card">
        <el-tag :type="getTagType(tpl.flowType)" size="small" effect="plain">{{ getFlowTypeLabel(tpl.flowType) }}</el-tag>
        <h3 class="tpl-name">{{ tpl.name }}</h3>
        <p class="tpl-desc">{{ tpl.description }}</p>
        <div class="tpl-actions">
          <el-button type="primary" size="small" @click="useTemplate(tpl)">{{ t('templates.useTemplate') }}</el-button>
        </div>
      </div>
      <el-empty v-if="officialTemplates.length === 0" :description="t('templates.emptyOfficial')" class="empty-block" />
    </div>

    <!-- My Templates -->
    <div v-if="activeTab === 'my'" class="template-grid">
      <div v-for="tpl in myTemplates" :key="tpl.id" class="template-card">
        <el-tag :type="getTagType(tpl.flowType)" size="small" effect="plain">{{ getFlowTypeLabel(tpl.flowType) }}</el-tag>
        <h3 class="tpl-name">{{ tpl.name }}</h3>
        <p class="tpl-desc">{{ tpl.description }}</p>
        <div class="tpl-actions">
          <el-button type="primary" size="small" @click="useTemplate(tpl)">{{ t('templates.useTemplate') }}</el-button>
          <el-button type="danger" size="small" plain @click="deleteTemplate(tpl)">{{ t('templates.deleteTemplate') }}</el-button>
        </div>
      </div>
      <el-empty v-if="myTemplates.length === 0" :description="t('templates.emptyMy')" class="empty-block" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { FlowService } from '@/services/flow.service'
import { FlowType } from '@/types/flow.types'

const { t } = useI18n()
const router = useRouter()

const activeTab = ref<'official' | 'my'>('official')

interface TemplateItem {
  id: string
  name: string
  description: string
  flowType: FlowType
  configInfoForRun?: any
  configInfoForWeb?: string
}

const officialTemplates: TemplateItem[] = [
  {
    id: 'official_smart_cs',
    name: '智能客服 / Smart Customer Service',
    description: '接收用户问题，通过 LLM 理解意图，条件分支处理不同场景，自动生成回复。',
    flowType: FlowType.AIFlow,
  },
  {
    id: 'official_doc_summary',
    name: '文档摘要 / Document Summary',
    description: '输入长文本，LLM 提取关键信息生成摘要，输出结构化结果。',
    flowType: FlowType.AIFlow,
  },
  {
    id: 'official_data_clean',
    name: '数据清洗 / Data Cleaning',
    description: '通过 JS 代码节点对输入数据进行格式校验、清洗和转换。',
    flowType: FlowType.LogicFlow,
  },
]

const myTemplates = computed<TemplateItem[]>(() => {
  const raw = localStorage.getItem('nf_my_templates')
  return raw ? JSON.parse(raw) : []
})

const getTagType = (flowType?: FlowType) => {
  if (flowType === FlowType.AIFlow) return 'warning'
  if (flowType === FlowType.ApprovalFlow) return 'success'
  return '' as const
}

const getFlowTypeLabel = (flowType?: FlowType) => {
  if (flowType === FlowType.AIFlow) return t('nav.aiFlow')
  if (flowType === FlowType.ApprovalFlow) return t('nav.approvalFlow')
  return t('nav.logicFlow')
}

const useTemplate = async (tpl: TemplateItem) => {
  try {
    const response = await FlowService.createFlow({
      displayName: tpl.name,
      flowType: tpl.flowType,
      description: tpl.description,
      configInfoForRun: tpl.configInfoForRun ?? undefined,
      configInfoForWeb: tpl.configInfoForWeb ?? undefined,
    })
    if (response.errCode === 0) {
      ElMessage.success(t('templates.templateUsed'))
      router.push('/studio')
    } else {
      ElMessage.error(response.errMsg || t('errors.operationFailed'))
    }
  } catch {
    ElMessage.error(t('errors.operationFailed'))
  }
}

const deleteTemplate = (tpl: TemplateItem) => {
  ElMessageBox.confirm(
    t('templates.deleteConfirm', { name: tpl.name }),
    t('flowList.deleteHint'),
    { type: 'warning' }
  ).then(() => {
    const raw = localStorage.getItem('nf_my_templates')
    const list: TemplateItem[] = raw ? JSON.parse(raw) : []
    const updated = list.filter(item => item.id !== tpl.id)
    localStorage.setItem('nf_my_templates', JSON.stringify(updated))
    ElMessage.success(t('flowList.deleteSuccess', { type: '' }))
  }).catch(() => {})
}
</script>

<style scoped>
.templates-page {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 24px;
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

.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 24px;
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  overflow: hidden;
  width: fit-content;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  background: transparent;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  color: var(--nf-text-secondary);
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn:not(:last-child) {
  border-right: 1px solid var(--nf-border);
}

.tab-btn.active {
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
}

.tab-badge {
  background: var(--nf-accent);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  line-height: 1.4;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.template-card {
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.2s ease;
}

.template-card:hover {
  border-color: var(--nf-accent-muted);
  transform: translateY(-2px);
  box-shadow: var(--nf-shadow-md);
}

.tpl-name {
  font-size: 16px;
  font-weight: 600;
  margin: 10px 0 6px;
  color: var(--nf-text-primary);
}

.tpl-desc {
  font-size: 13px;
  color: var(--nf-text-secondary);
  line-height: 1.5;
  margin: 0 0 16px;
}

.tpl-actions {
  display: flex;
  gap: 8px;
}

.empty-block {
  grid-column: 1 / -1;
  padding: 48px 0;
}
</style>
