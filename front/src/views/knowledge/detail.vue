<template>
  <div class="kb-detail-page">
    <!-- Header -->
    <div class="detail-header">
      <div class="header-left">
        <div class="header-info">
          <div class="kb-breadcrumb">
            <button class="breadcrumb-link" type="button" @click="router.push('/knowledge')">
              {{ t('knowledge.title') }}
            </button>
            <span class="breadcrumb-separator"> &gt; </span>
            <span class="breadcrumb-current">{{ kb?.name || '-' }}</span>
          </div>
        </div>
      </div>
      <div class="header-stats">
        <div class="stat-badge">
          <el-icon><Document /></el-icon>
          {{ t('knowledge.docCount', { count: kb?.docCount ?? 0 }) }}
        </div>
        <div class="stat-badge">
          <el-icon><Grid /></el-icon>
          {{ t('knowledge.chunkCount', { count: kb?.chunkCount ?? 0 }) }}
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <el-tabs v-model="activeTab" class="detail-tabs">
      <!-- Documents Tab -->
      <el-tab-pane :label="t('knowledge.documents')" name="documents">
        <div class="tab-toolbar">
          <el-upload
            :show-file-list="false"
            :before-upload="handleUpload"
            accept=".txt,.md,.pdf,.csv,.json,.log"
            :multiple="false"
          >
            <el-button type="primary" :icon="Upload" :loading="uploading">
              {{ t('knowledge.uploadDoc') }}
            </el-button>
          </el-upload>
          <span class="upload-hint">{{ t('knowledge.uploadHint') }}</span>
        </div>

        <el-table :data="documents" v-loading="docLoading" class="doc-table">
          <el-table-column prop="fileName" :label="t('fields.flowName')" min-width="200" />
          <el-table-column :label="t('common.status')" width="120">
            <template #default="{ row }">
              <el-tag
                :type="getStatusType(row.status)"
                size="small"
                effect="plain"
              >
                {{ getStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('knowledge.chunkCount', { count: '' })" width="100">
            <template #default="{ row }">{{ row.chunkCount }}</template>
          </el-table-column>
          <el-table-column prop="fileSize" label="Size" width="100">
            <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.createdTime')" width="160">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="180" fixed="right">
            <template #default="{ row }">
              <el-button
                text
                type="primary"
                size="small"
                :disabled="row.status !== 'completed'"
                @click="viewChunks(row)"
              >
                {{ t('knowledge.viewChunks') }}
              </el-button>
              <el-button text type="danger" size="small" @click="deleteDoc(row)">
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- Search Test Tab -->
      <el-tab-pane :label="t('knowledge.searchTest')" name="search">
        <div class="search-panel">
          <div class="search-config">
            <el-form :inline="true" size="default">
              <el-form-item :label="t('knowledge.topK')">
                <el-input-number v-model="searchParams.topK" :min="1" :max="20" />
              </el-form-item>
              <el-form-item :label="t('knowledge.threshold')">
                <el-input-number v-model="searchParams.threshold" :min="0" :max="1" :step="0.05" :precision="2" />
              </el-form-item>
            </el-form>
          </div>
          <div class="search-bar">
            <el-input
              v-model="searchQuery"
              :placeholder="t('knowledge.searchPlaceholder')"
              size="large"
              @keyup.enter="doSearch"
            >
              <template #append>
                <el-button :icon="Search" :loading="searching" @click="doSearch">
                  {{ t('knowledge.search') }}
                </el-button>
              </template>
            </el-input>
          </div>

          <div v-if="searchResults.length > 0" class="search-results">
            <div v-for="(result, idx) in searchResults" :key="idx" class="result-card">
              <div class="result-header">
                <span class="result-rank">#{{ idx + 1 }}</span>
                <el-tag type="success" size="small" effect="plain">
                  {{ t('knowledge.similarity') }}: {{ (result.similarity * 100).toFixed(1) }}%
                </el-tag>
                <span class="result-source">
                  {{ t('knowledge.source') }}: {{ result.fileName }} · {{ t('knowledge.chunkIndex', { index: result.chunkIndex + 1 }) }}
                </span>
              </div>
              <p class="result-content">{{ result.content }}</p>
            </div>
          </div>

          <el-empty
            v-if="searchDone && searchResults.length === 0"
            :description="t('knowledge.noResults')"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- Chunk Preview Drawer -->
    <el-drawer v-model="chunkDrawerVisible" :title="t('knowledge.chunkPreview')" size="45%">
      <div v-loading="chunkLoading" class="chunk-list">
        <div v-for="chunk in chunks" :key="chunk.id" class="chunk-item">
          <div class="chunk-header">
            <span class="chunk-index">{{ t('knowledge.chunkIndex', { index: chunk.chunkIndex + 1 }) }}</span>
            <el-tag size="small" type="info" effect="plain">
              {{ t('knowledge.tokens', { count: chunk.tokenCount }) }}
            </el-tag>
          </div>
          <p class="chunk-content">{{ chunk.content }}</p>
        </div>
        <el-empty v-if="!chunkLoading && chunks.length === 0" />
      </div>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Grid, Upload, Search } from '@element-plus/icons-vue'
import {
  KnowledgeService,
  type IKnowledgeBaseDto,
  type IKnowledgeDocDto,
  type IDocChunkDto,
  type ISearchResultDto,
} from '@/services/knowledge.service'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const kbId = route.params.id as string

const kb = ref<IKnowledgeBaseDto | null>(null)
const documents = ref<IKnowledgeDocDto[]>([])
const activeTab = ref('documents')
const docLoading = ref(false)
const uploading = ref(false)

// Chunk preview
const chunkDrawerVisible = ref(false)
const chunkLoading = ref(false)
const chunks = ref<IDocChunkDto[]>([])

// Search test
const searchQuery = ref('')
const searching = ref(false)
const searchDone = ref(false)
const searchResults = ref<ISearchResultDto[]>([])
const searchParams = ref({ topK: 5, threshold: 0.3 })

const loadDetail = async () => {
  docLoading.value = true
  try {
    const res = await KnowledgeService.getById(kbId)
    if (res.errCode === 0 && res.data) {
      kb.value = res.data
      documents.value = res.data.documents || []
    }
  } catch {
    ElMessage.error(t('errors.loadFailed'))
  } finally {
    docLoading.value = false
  }
}

const handleUpload = async (file: File) => {
  if (file.size > 10 * 1024 * 1024) {
    ElMessage.warning('File size exceeds 10MB limit')
    return false
  }

  uploading.value = true
  try {
    const res = await KnowledgeService.uploadDocument(kbId, file)
    if (res.errCode === 0) {
      ElMessage.success(t('success.operationSuccess'))
      setTimeout(() => loadDetail(), 1000)
    } else {
      ElMessage.error(res.errMsg || t('errors.operationFailed'))
    }
  } catch {
    ElMessage.error(t('errors.operationFailed'))
  } finally {
    uploading.value = false
  }
  return false
}

const viewChunks = async (doc: IKnowledgeDocDto) => {
  chunkDrawerVisible.value = true
  chunkLoading.value = true
  try {
    const res = await KnowledgeService.getDocumentChunks(doc.id)
    if (res.errCode === 0) {
      chunks.value = res.data || []
    }
  } catch {
    ElMessage.error(t('errors.loadFailed'))
  } finally {
    chunkLoading.value = false
  }
}

const deleteDoc = (doc: IKnowledgeDocDto) => {
  ElMessageBox.confirm(
    t('knowledge.deleteDocConfirm', { name: doc.fileName }),
    t('flowList.deleteHint'),
    { type: 'warning' },
  ).then(async () => {
    const res = await KnowledgeService.deleteDocument(doc.id)
    if (res.errCode === 0) {
      ElMessage.success(t('flowList.deleteSuccess', { type: '' }))
      loadDetail()
    }
  }).catch(() => {})
}

const doSearch = async () => {
  if (!searchQuery.value.trim()) return
  searching.value = true
  searchDone.value = false
  try {
    const res = await KnowledgeService.search({
      knowledgeBaseId: kbId,
      query: searchQuery.value,
      topK: searchParams.value.topK,
      threshold: searchParams.value.threshold,
    })
    if (res.errCode === 0) {
      searchResults.value = res.data || []
    }
  } catch {
    ElMessage.error(t('errors.operationFailed'))
  } finally {
    searching.value = false
    searchDone.value = true
  }
}

const getStatusType = (status: string) => {
  const map: Record<string, string> = {
    completed: 'success',
    processing: 'warning',
    pending: 'info',
    error: 'danger',
  }
  return (map[status] || 'info') as any
}

const getStatusLabel = (status: string) => {
  const key = `knowledge.${status}` as any
  return t(key) || status
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

onMounted(() => {
  loadDetail()
})
</script>

<style scoped>
.kb-detail-page {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
  font-family: var(--nf-font-display);
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--nf-border);
}

.header-left {
  display: flex;
  align-items: flex-start;
  min-width: 0;
}

.header-info {
  min-width: 0;
}

.kb-breadcrumb {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-family: var(--nf-font-display);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.04em;
}

.breadcrumb-link {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--nf-text-body, #8B9DB0);
  font: inherit;
  cursor: pointer;
  transition: color 0.2s ease;
}

.breadcrumb-link:hover {
  color: var(--nf-accent, #00FF9F);
}

.breadcrumb-separator {
  color: var(--nf-text-tertiary, #4A5C6E);
  font-size: 12px;
}

.breadcrumb-current {
  min-width: 0;
  color: var(--nf-text-primary, #E6EDF3);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-stats {
  display: flex;
  gap: 12px;
}

.stat-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 6px;
  font-family: var(--nf-font-mono);
  font-size: 12px;
  color: #6B7D8E;
  font-variant-numeric: tabular-nums;
}

.detail-tabs {
  margin-top: 8px;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.upload-hint {
  font-size: 12px;
  color: #4A5C6E;
  letter-spacing: 0.02em;
}

.doc-table {
  border-radius: 8px;
}

/* Search Panel */
.search-panel {
  max-width: 800px;
}

.search-config {
  margin-bottom: 16px;
}

.search-bar {
  margin-bottom: 24px;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s ease;
}

.result-card:hover {
  border-color: rgba(0, 255, 159, 0.4);
  box-shadow: 0 0 12px rgba(0, 255, 159, 0.08);
}

.result-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.result-rank {
  font-weight: 700;
  font-size: 14px;
  color: var(--nf-accent);
}

.result-source {
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #4A5C6E;
  margin-left: auto;
}

.result-content {
  font-size: 13px;
  line-height: 1.7;
  color: #7A8B9C;
  margin: 0;
  white-space: pre-wrap;
  letter-spacing: 0.02em;
}

/* Chunk Drawer */
.chunk-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chunk-item {
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  padding: 14px;
}

.chunk-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.chunk-index {
  font-weight: 600;
  font-size: 13px;
  color: var(--nf-accent);
}

.chunk-content {
  font-size: 13px;
  line-height: 1.7;
  color: #7A8B9C;
  margin: 0;
  white-space: pre-wrap;
  letter-spacing: 0.02em;
  max-height: 200px;
  overflow-y: auto;
}
</style>
