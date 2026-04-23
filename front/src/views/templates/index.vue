<template>
  <div class="templates-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('templates.title') }}</h2>
        <p class="page-subtitle">{{ t('templates.subtitle') }}</p>
      </div>
      <div class="header-actions">
        <el-input
          v-model="searchKeyword"
          :placeholder="t('templates.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          class="search-input"
          @input="debouncedSearch"
        />
      </div>
    </div>

    <div class="tab-bar">
      <button :class="['tab-btn', { active: activeTab === 'all' }]" @click="switchTab('all')">
        {{ t('templates.all') }}
      </button>
      <button :class="['tab-btn', { active: activeTab === 'official' }]" @click="switchTab('official')">
        {{ t('templates.official') }}
      </button>
      <button :class="['tab-btn', { active: activeTab === 'my' }]" @click="switchTab('my')">
        {{ t('templates.myTemplates') }}
      </button>
    </div>

    <div class="category-filter">
      <el-tag
        v-for="cat in categories"
        :key="cat.value"
        :type="selectedCategory === cat.value ? 'primary' : 'info'"
        :effect="selectedCategory === cat.value ? 'dark' : 'plain'"
        class="category-tag"
        @click="filterByCategory(cat.value)"
      >
        {{ cat.label }}
      </el-tag>
    </div>

    <div v-loading="loading" class="template-grid">
      <div v-for="tpl in templates" :key="tpl.id" class="template-card">
        <div class="card-header">
          <el-tag :type="getTagType(tpl.flowType)" size="small" effect="plain">
            {{ getFlowTypeLabel(tpl.flowType) }}
          </el-tag>
          <el-tag v-if="tpl.isOfficial" type="warning" size="small" effect="dark">官方</el-tag>
        </div>
        <h3 class="tpl-name">{{ tpl.name }}</h3>
        <p class="tpl-desc">{{ tpl.description }}</p>
        <div v-if="tpl.tags?.length" class="tpl-tags">
          <el-tag v-for="tag in tpl.tags" :key="tag" size="small" type="info" effect="plain">
            {{ tag }}
          </el-tag>
        </div>
        <div class="tpl-meta">
          <span class="meta-item">{{ tpl.createdBy }}</span>
          <span class="meta-item">{{ formatDate(tpl.createdAt) }}</span>
        </div>
        <div class="tpl-actions">
          <el-button type="primary" size="small" @click="useTemplate(tpl)">
            {{ t('templates.useTemplate') }}
          </el-button>
          <el-button
            v-if="!tpl.isOfficial"
            type="danger"
            size="small"
            plain
            @click="deleteTemplate(tpl)"
          >
            {{ t('templates.deleteTemplate') }}
          </el-button>
        </div>
      </div>
      <el-empty
        v-if="!loading && templates.length === 0"
        :description="activeTab === 'official' ? t('templates.emptyOfficial') : t('templates.emptyMy')"
        class="empty-block"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { FlowService } from '@/services/flow.service'
import { TemplateService, type ITemplateDto } from '@/services/template.service'

const { t } = useI18n()
const router = useRouter()

const activeTab = ref<'all' | 'official' | 'my'>('all')
const searchKeyword = ref('')
const selectedCategory = ref('')
const loading = ref(false)
const templates = ref<ITemplateDto[]>([])

const categories = [
  { value: '', label: t('templates.all') },
  { value: 'custom', label: t('templates.categoryCustom') },
  { value: 'customer-service', label: t('templates.categoryCs') },
  { value: 'content', label: t('templates.categoryContent') },
  { value: 'data', label: t('templates.categoryData') },
  { value: 'rag', label: t('templates.categoryRag') },
]

let searchTimer: ReturnType<typeof setTimeout> | null = null
const debouncedSearch = () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadTemplates(), 300)
}

const switchTab = (tab: 'all' | 'official' | 'my') => {
  activeTab.value = tab
  loadTemplates()
}

const filterByCategory = (cat: string) => {
  selectedCategory.value = selectedCategory.value === cat ? '' : cat
  loadTemplates()
}

const loadTemplates = async () => {
  loading.value = true
  try {
    const params: any = {
      keyword: searchKeyword.value || undefined,
      category: selectedCategory.value || undefined,
      pageSize: 50,
    }
    if (activeTab.value === 'official') params.isOfficial = true
    if (activeTab.value === 'my') params.isOfficial = false

    const res = await TemplateService.getList(params)
    if (res.errCode === 0) {
      templates.value = res.data?.items || []
    }
  } catch {
    ElMessage.error(t('errors.loadFailed'))
  } finally {
    loading.value = false
  }
}

const getTagType = (flowType?: number): 'warning' | 'success' | 'info' => {
  if (flowType === 1) return 'warning'
  if (flowType === 2) return 'success'
  return 'info'
}

const getFlowTypeLabel = (flowType?: number) => {
  if (flowType === 1) return t('nav.aiFlow')
  if (flowType === 2) return t('nav.approvalFlow')
  return t('nav.logicFlow')
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

const useTemplate = async (tpl: ITemplateDto) => {
  try {
    const response = await FlowService.createFlow({
      displayName: tpl.name,
      flowType: tpl.flowType as any,
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

const deleteTemplate = (tpl: ITemplateDto) => {
  ElMessageBox.confirm(
    t('templates.deleteConfirm', { name: tpl.name }),
    t('flowList.deleteHint'),
    { type: 'warning' },
  )
    .then(async () => {
      const res = await TemplateService.delete(tpl.id)
      if (res.errCode === 0) {
        ElMessage.success(t('flowList.deleteSuccess', { type: '' }))
        loadTemplates()
      }
    })
    .catch(() => {})
}

onMounted(() => {
  loadTemplates()
})
</script>

<style scoped>
.templates-page {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: var(--nf-font-display);
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 24px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 4px;
  color: #E6EDF3;
  letter-spacing: 0.06em;
}

.page-subtitle {
  font-size: 13px;
  color: #6B7D8E;
  margin: 0;
  letter-spacing: 0.04em;
}

.search-input {
  width: 260px;
}

.tab-bar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
  border: 1px solid #1E2733;
  border-radius: 6px;
  overflow: hidden;
  width: fit-content;
}

.tab-btn {
  padding: 8px 20px;
  border: none;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.03em;
  cursor: pointer;
  color: #6B7D8E;
  transition: all 0.15s;
}

.tab-btn:not(:last-child) {
  border-right: 1px solid var(--nf-border);
}

.tab-btn.active {
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
}

.category-filter {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.category-tag {
  cursor: pointer;
  transition: all 0.15s;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.template-card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 8px;
  padding: 20px;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
}

.template-card:hover {
  border-color: rgba(0, 255, 159, 0.4);
  box-shadow: 0 0 16px rgba(0, 255, 159, 0.12), 0 0 32px rgba(0, 255, 159, 0.04);
}

.card-header {
  display: flex;
  gap: 6px;
  align-items: center;
}

.tpl-name {
  font-size: 15px;
  font-weight: 600;
  margin: 10px 0 6px;
  color: #E6EDF3;
  letter-spacing: 0.06em;
}

.tpl-desc {
  font-size: 13px;
  color: #7A8B9C;
  line-height: 1.7;
  letter-spacing: 0.02em;
  margin: 0 0 10px;
  flex: 1;
}

.tpl-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.tpl-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #4A5C6E;
  font-variant-numeric: tabular-nums;
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
