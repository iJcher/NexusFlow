<template>
  <div class="knowledge-page">
    <div class="page-header">
      <div>
        <h2 class="page-title">{{ t('knowledge.title') }}</h2>
        <p class="page-subtitle">{{ t('knowledge.subtitle') }}</p>
      </div>
      <el-button type="primary" :icon="Plus" @click="showCreateDialog">
        {{ t('knowledge.create') }}
      </el-button>
    </div>

    <div v-loading="loading" class="card-grid">
      <div
        v-for="kb in knowledgeBases"
        :key="kb.id"
        class="kb-card"
        @click="goToDetail(kb.id)"
      >
        <div class="kb-card-header">
          <div class="kb-icon">
            <el-icon :size="24"><Collection /></el-icon>
          </div>
          <el-dropdown trigger="click" @command="handleCommand($event, kb)" @click.stop>
            <el-icon class="kb-more"><MoreFilled /></el-icon>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="edit">
                  <el-icon><Edit /></el-icon>{{ t('common.edit') }}
                </el-dropdown-item>
                <el-dropdown-item command="delete" divided>
                  <el-icon><Delete /></el-icon>{{ t('common.delete') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <h3 class="kb-name">{{ kb.name }}</h3>
        <p class="kb-desc">{{ kb.description || t('flowList.noDescription') }}</p>
        <div class="kb-stats">
          <span class="stat-item">
            <el-icon><Document /></el-icon>
            {{ t('knowledge.docCount', { count: kb.docCount }) }}
          </span>
          <span class="stat-item">
            <el-icon><Grid /></el-icon>
            {{ t('knowledge.chunkCount', { count: kb.chunkCount }) }}
          </span>
        </div>
        <div class="kb-status">
          <el-tag :type="kb.status === 'active' ? 'success' : 'info'" size="small" effect="plain">
            {{ kb.status === 'active' ? t('knowledge.completed') : kb.status }}
          </el-tag>
          <span class="kb-date">{{ formatDate(kb.updatedAt) }}</span>
        </div>
      </div>

      <el-empty
        v-if="!loading && knowledgeBases.length === 0"
        class="empty-state"
      >
        <template #description>
          <div class="empty-content">
            <el-icon :size="48" color="var(--nf-text-muted)"><Collection /></el-icon>
            <p class="empty-title">{{ t('knowledge.emptyTitle') }}</p>
            <p class="empty-desc">{{ t('knowledge.emptyDesc') }}</p>
          </div>
        </template>
      </el-empty>
    </div>

    <!-- Create / Edit Dialog -->
    <el-dialog v-model="dialogVisible" :title="editingKb ? t('knowledge.editKb') : t('knowledge.create')" width="480px">
      <el-form :model="formData" label-position="top">
        <el-form-item :label="t('knowledge.name')" required>
          <el-input v-model="formData.name" :placeholder="t('knowledge.namePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('knowledge.description')">
          <el-input v-model="formData.description" type="textarea" :rows="3" :placeholder="t('knowledge.descPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Collection, Document, Grid, MoreFilled, Edit, Delete } from '@element-plus/icons-vue'
import { KnowledgeService, type IKnowledgeBaseDto } from '@/services/knowledge.service'

const { t } = useI18n()
const router = useRouter()

const loading = ref(false)
const submitting = ref(false)
const knowledgeBases = ref<IKnowledgeBaseDto[]>([])
const dialogVisible = ref(false)
const editingKb = ref<IKnowledgeBaseDto | null>(null)
const formData = ref({ name: '', description: '' })

const loadList = async () => {
  loading.value = true
  try {
    const res = await KnowledgeService.getList({ pageSize: 50 })
    if (res.errCode === 0) {
      knowledgeBases.value = res.data?.items || []
    }
  } catch {
    ElMessage.error(t('errors.loadFailed'))
  } finally {
    loading.value = false
  }
}

const showCreateDialog = () => {
  editingKb.value = null
  formData.value = { name: '', description: '' }
  dialogVisible.value = true
}

const handleCommand = (command: string, kb: IKnowledgeBaseDto) => {
  if (command === 'edit') {
    editingKb.value = kb
    formData.value = { name: kb.name, description: kb.description }
    dialogVisible.value = true
  } else if (command === 'delete') {
    ElMessageBox.confirm(
      t('knowledge.deleteKbConfirm', { name: kb.name }),
      t('flowList.deleteHint'),
      { type: 'warning' },
    ).then(async () => {
      const res = await KnowledgeService.delete(kb.id)
      if (res.errCode === 0) {
        ElMessage.success(t('flowList.deleteSuccess', { type: '' }))
        loadList()
      }
    }).catch(() => {})
  }
}

const handleSubmit = async () => {
  if (!formData.value.name) {
    ElMessage.warning(t('knowledge.nameRequired'))
    return
  }

  submitting.value = true
  try {
    if (editingKb.value) {
      const res = await KnowledgeService.update({
        id: editingKb.value.id,
        name: formData.value.name,
        description: formData.value.description,
      })
      if (res.errCode === 0) {
        ElMessage.success(t('success.updated', { name: t('knowledge.title') }))
        dialogVisible.value = false
        loadList()
      }
    } else {
      const res = await KnowledgeService.create(formData.value)
      if (res.errCode === 0) {
        ElMessage.success(t('success.created', { name: t('knowledge.title') }))
        dialogVisible.value = false
        loadList()
      }
    }
  } catch {
    ElMessage.error(t('errors.operationFailed'))
  } finally {
    submitting.value = false
  }
}

const goToDetail = (id: string) => {
  router.push(`/knowledge/${id}`)
}

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString()
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.knowledge-page {
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

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  min-height: 200px;
}

.kb-card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1A2030;
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.kb-card:hover {
  border-color: rgba(0, 255, 159, 0.4);
  box-shadow: 0 0 16px rgba(0, 255, 159, 0.12), 0 0 32px rgba(0, 255, 159, 0.04);
}

.kb-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.kb-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--nf-accent-muted);
  color: var(--nf-accent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kb-more {
  cursor: pointer;
  color: #3A4E5E;
  transition: color 0.15s;
}

.kb-more:hover {
  color: var(--nf-accent);
}

.kb-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  color: #E6EDF3;
  letter-spacing: 0.06em;
}

.kb-desc {
  font-size: 13px;
  color: #7A8B9C;
  line-height: 1.7;
  letter-spacing: 0.02em;
  margin: 0 0 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kb-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #4A5C6E;
  font-variant-numeric: tabular-nums;
}

.kb-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.kb-date {
  font-family: var(--nf-font-mono);
  font-size: 11px;
  color: #4A5C6E;
  font-variant-numeric: tabular-nums;
}

.empty-state {
  grid-column: 1 / -1;
  padding: 80px 0;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: #E6EDF3;
  margin: 8px 0 0;
  letter-spacing: 0.04em;
}

.empty-desc {
  font-size: 13px;
  color: #6B7D8E;
  margin: 0;
  letter-spacing: 0.02em;
}
</style>
