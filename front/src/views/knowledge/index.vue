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

    <div class="card-grid">
      <el-empty :description="t('knowledge.emptyTitle')" class="empty-state">
        <template #description>
          <div class="empty-content">
            <el-icon :size="48" color="var(--nf-text-muted)"><Collection /></el-icon>
            <p class="empty-title">{{ t('knowledge.emptyTitle') }}</p>
            <p class="empty-desc">{{ t('knowledge.emptyDesc') }}</p>
          </div>
        </template>
      </el-empty>
    </div>

    <el-dialog v-model="dialogVisible" :title="t('knowledge.create')" width="480px">
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
        <el-button type="primary" @click="handleCreate">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Plus, Collection } from '@element-plus/icons-vue'

const { t } = useI18n()

const dialogVisible = ref(false)
const formData = ref({ name: '', description: '' })

const showCreateDialog = () => {
  formData.value = { name: '', description: '' }
  dialogVisible.value = true
}

const handleCreate = () => {
  if (!formData.value.name) {
    ElMessage.warning(t('knowledge.nameRequired'))
    return
  }
  ElMessage.info(t('knowledge.comingSoon'))
  dialogVisible.value = false
}
</script>

<style scoped>
.knowledge-page {
  padding: 24px 32px;
  max-width: 1200px;
  margin: 0 auto;
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
  color: var(--nf-text-primary);
}

.page-subtitle {
  font-size: 14px;
  color: var(--nf-text-muted);
  margin: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
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
  color: var(--nf-text-primary);
  margin: 8px 0 0;
}

.empty-desc {
  font-size: 14px;
  color: var(--nf-text-muted);
  margin: 0;
}
</style>
