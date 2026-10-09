<!--
  大模型提供者管理页面
-->
<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type { IFlowLLMProviderDto } from '@/types/llmProvider.types'
import { CopyDocument, Delete, Edit, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { LLMProviderService } from '@/services/llmProvider.service'

const { t } = useI18n()

const providerList = ref<IFlowLLMProviderDto[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const editingProvider = ref<IFlowLLMProviderDto | null>(null)
const saving = ref(false)

const formRef = ref<FormInstance>()

const formData = ref({
  platformName: '',
  llmNames: [] as string[],
  llmapiUrl: '',
  llmapiKey: '',
})

const newModelName = ref('')

const formRules = computed<FormRules>(() => ({
  platformName: [
    { required: true, message: t('llmProviderMgmt.platformNameRequired'), trigger: 'blur' },
  ],
  llmNames: [
    {
      validator: (_rule: unknown, value: string[], callback: (error?: Error) => void) => {
        if (!value || value.length === 0) {
          callback(new Error(t('llmProviderMgmt.modelNameRequired')))
        }
        else {
          callback()
        }
      },
      trigger: 'change',
    },
  ],
  llmapiUrl: [
    { required: true, message: t('llmProviderMgmt.apiUrlRequired'), trigger: 'blur' },
    { type: 'url', message: t('llmProviderMgmt.apiUrlInvalid'), trigger: 'blur' },
  ],
  llmapiKey: [
    { required: true, message: t('llmProviderMgmt.apiKeyRequired'), trigger: 'blur' },
  ],
}))

async function loadProviderList() {
  try {
    loading.value = true
    const response = await LLMProviderService.getProviderList()

    if (response.errCode === 0 && response.data) {
      providerList.value = response.data
    }
    else {
      ElMessage.error(response.errMsg || t('llmProviderMgmt.loadFailed'))
    }
  }
  catch (error) {
    console.error('Failed to load LLM provider list:', error)
    ElMessage.error(t('llmProviderMgmt.loadFailed'))
  }
  finally {
    loading.value = false
  }
}

function createProvider() {
  editingProvider.value = null
  formData.value = {
    platformName: '',
    llmNames: [],
    llmapiUrl: '',
    llmapiKey: '',
  }
  newModelName.value = ''
  dialogVisible.value = true
}

function editProvider(provider: IFlowLLMProviderDto) {
  editingProvider.value = provider
  formData.value = {
    platformName: provider.platformName || '',
    llmNames: provider.llmNames ? [...provider.llmNames] : [],
    llmapiUrl: provider.llmapiUrl || '',
    llmapiKey: provider.llmapiKey || '',
  }
  newModelName.value = ''
  dialogVisible.value = true
}

async function saveProvider() {
  if (!formRef.value)
    return

  const valid = await formRef.value.validate().catch(() => false)
  if (!valid)
    return

  try {
    saving.value = true

    if (editingProvider.value && editingProvider.value.id) {
      const response = await LLMProviderService.updateProvider({
        id: editingProvider.value.id,
        platformName: formData.value.platformName,
        llmNames: formData.value.llmNames,
        llmapiUrl: formData.value.llmapiUrl,
        llmapiKey: formData.value.llmapiKey,
      })

      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.updateSuccess'))
        await loadProviderList()
        dialogVisible.value = false
      }
      else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.updateFailed'))
      }
    }
    else {
      const response = await LLMProviderService.createProvider({
        platformName: formData.value.platformName,
        llmNames: formData.value.llmNames,
        llmapiUrl: formData.value.llmapiUrl,
        llmapiKey: formData.value.llmapiKey,
      })

      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.createSuccess'))
        await loadProviderList()
        dialogVisible.value = false
      }
      else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.createFailed'))
      }
    }
  }
  catch (error) {
    console.error('Failed to save LLM provider:', error)
    ElMessage.error(t('llmProviderMgmt.saveFailed'))
  }
  finally {
    saving.value = false
  }
}

async function deleteProvider(provider: IFlowLLMProviderDto) {
  ElMessageBox.confirm(t('llmProviderMgmt.deleteConfirm'), t('llmProviderMgmt.deleteHint'), {
    type: 'warning',
    confirmButtonText: t('llmProviderMgmt.confirm'),
    cancelButtonText: t('llmProviderMgmt.cancel'),
  }).then(async () => {
    if (!provider.id) {
      ElMessage.warning(t('llmProviderMgmt.invalidProviderId'))
      return
    }

    try {
      const response = await LLMProviderService.deleteProvider(provider.id)
      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.deleteSuccess'))
        await loadProviderList()
      }
      else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.deleteFailed'))
      }
    }
    catch (error) {
      console.error('Failed to delete LLM provider:', error)
      ElMessage.error(t('llmProviderMgmt.deleteFailed'))
    }
  }).catch(() => {})
}

function addModelName() {
  const name = newModelName.value.trim()
  if (!name) {
    ElMessage.warning(t('llmProviderMgmt.modelNameEmpty'))
    return
  }

  if (formData.value.llmNames.includes(name)) {
    ElMessage.warning(t('llmProviderMgmt.modelNameDuplicate'))
    return
  }

  formData.value.llmNames.push(name)
  newModelName.value = ''

  formRef.value?.validateField('llmNames')
}

function removeModelName(index: number) {
  formData.value.llmNames.splice(index, 1)
  formRef.value?.validateField('llmNames')
}

async function copyApiKey(apiKey: string | undefined) {
  if (!apiKey) {
    ElMessage.warning(t('llmProviderMgmt.apiKeyEmpty'))
    return
  }

  try {
    await navigator.clipboard.writeText(apiKey)
    ElMessage.success(t('llmProviderMgmt.copySuccess'))
  }
  catch (error) {
    console.error('Copy failed:', error)
    ElMessage.error(t('llmProviderMgmt.copyFailed'))
  }
}

function maskApiKey(apiKey: string | undefined) {
  if (!apiKey)
    return t('llmProviderMgmt.notSet')
  if (apiKey.length <= 8)
    return '****'
  return `${apiKey.substring(0, 4)}****${apiKey.substring(apiKey.length - 4)}`
}

onMounted(() => {
  loadProviderList()
})

watch(() => t('llmProviderMgmt.title'), () => {})
</script>

<template>
  <div class="nf-page">
    <div class="nf-page-header flex-between">
      <el-button class="m-0" type="primary" :icon="Plus" @click="createProvider">
        {{ t('llmProviderMgmt.add') }}
      </el-button>
    </div>

    <div class="mt-0 overflow-hidden nf-card">
      <el-table
        v-loading="loading"
        :data="providerList"
        style="width: 100%"
      >
        <el-table-column prop="id" :label="t('llmProviderMgmt.id')" min-width="160">
          <template #default="{ row }">
            <span class="whitespace-nowrap text-3.25 font-mono">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="platformName" :label="t('llmProviderMgmt.platformName')" min-width="120" />
        <el-table-column :label="t('llmProviderMgmt.modelNames')" min-width="180">
          <template #default="{ row }">
            <el-tag
              v-for="(name, index) in row.llmNames"
              :key="index"
              size="small"
              class="mb-1 mr-1.5"
            >
              {{ name }}
            </el-tag>
            <span v-if="!row.llmNames || row.llmNames.length === 0" class="text-nf-text-muted">{{ t('llmProviderMgmt.notSet') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="llmapiUrl" :label="t('llmProviderMgmt.apiUrl')" min-width="180" show-overflow-tooltip />
        <el-table-column :label="t('llmProviderMgmt.apiKey')" width="160">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <span class="text-3.25 text-nf-text-secondary font-mono">{{ maskApiKey(row.llmapiKey) }}</span>
              <el-button
                text
                type="primary"
                :icon="CopyDocument"
                size="small"
                :title="t('llmProviderMgmt.copyApiKey')"
                @click="copyApiKey(row.llmapiKey)"
              />
            </div>
          </template>
        </el-table-column>
        <el-table-column :label="t('llmProviderMgmt.operation')" width="200" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-1 whitespace-nowrap">
              <el-button text type="primary" :icon="Edit" @click="editProvider(row)">
                {{ t('llmProviderMgmt.edit') }}
              </el-button>
              <el-button text type="danger" :icon="Delete" @click="deleteProvider(row)">
                {{ t('llmProviderMgmt.delete') }}
              </el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-empty
      v-if="providerList.length === 0 && !loading"
      :description="t('llmProviderMgmt.emptyState')"
      class="py-15"
    />

    <el-dialog
      v-model="dialogVisible"
      :title="editingProvider ? t('llmProviderMgmt.editTitle') : t('llmProviderMgmt.createTitle')"
      width="600px"
    >
      <el-form ref="formRef" :model="formData" label-width="auto" :rules="formRules">
        <el-form-item :label="t('llmProviderMgmt.platformName')" prop="platformName" required>
          <el-input
            v-model="formData.platformName"
            :placeholder="t('llmProviderMgmt.platformPlaceholder')"
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('llmProviderMgmt.modelNames')" prop="llmNames" required>
          <div class="mb-2">
            <el-tag
              v-for="(name, index) in formData.llmNames"
              :key="index"
              closable
              class="mb-1.5 mr-1.5"
              @close="removeModelName(index)"
            >
              {{ name }}
            </el-tag>
          </div>
          <el-input
            v-model="newModelName"
            :placeholder="t('llmProviderMgmt.modelPlaceholder')"
            clearable
            @keyup.enter="addModelName"
          >
            <template #append>
              <el-button :icon="Plus" @click="addModelName">
                {{ t('llmProviderMgmt.addModel') }}
              </el-button>
            </template>
          </el-input>
          <div class="mt-1 text-3 text-nf-text-muted">
            {{ t('llmProviderMgmt.duplicateModelHint') }}
          </div>
        </el-form-item>

        <el-form-item :label="t('llmProviderMgmt.apiUrl')" prop="llmapiUrl" required>
          <el-input
            v-model="formData.llmapiUrl"
            :placeholder="t('llmProviderMgmt.apiUrlPlaceholder')"
            clearable
          />
        </el-form-item>

        <el-form-item :label="t('llmProviderMgmt.apiKey')" prop="llmapiKey" required>
          <el-input
            v-model="formData.llmapiKey"
            :placeholder="t('llmProviderMgmt.apiKeyPlaceholder')"
            clearable
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">
          {{ t('llmProviderMgmt.cancel') }}
        </el-button>
        <el-button type="primary" :loading="saving" @click="saveProvider">
          {{ t('llmProviderMgmt.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.nf-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 32px;
  font-family: var(--nf-font-display);
}

.nf-page-header {
  margin-bottom: 16px;
}

.nf-card {
  background: rgba(8, 11, 16, 0.5);
  border: 1px solid #1a2030;
  border-radius: 8px;
}

:deep(.el-table) {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(14, 18, 24, 0.6);
  --el-table-row-hover-bg-color: rgba(0, 255, 159, 0.03);
  --el-table-border-color: #141a22;
  --el-table-header-text-color: #6b7d8e;
  --el-table-text-color: #c0cdd8;
  font-family: var(--nf-font-display);
}

:deep(.el-table th .cell) {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: 12px;
  white-space: nowrap;
}

:deep(.el-table td .cell) {
  font-size: 13px;
  letter-spacing: 0.02em;
}

/* Dialog overrides */
:deep(.el-dialog) {
  background: #080b10;
  border: 1px solid #1e2733;
  border-radius: 8px;
}

:deep(.el-dialog__title) {
  font-family: var(--nf-font-display);
  color: #e6edf3;
  font-weight: 700;
  letter-spacing: 0.06em;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #141a22;
}

:deep(.el-form-item__label) {
  font-family: var(--nf-font-display);
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #6b7d8e;
  white-space: nowrap;
}

:deep(.el-input__inner) {
  font-family: var(--nf-font-display);
  color: #c0cdd8;
  letter-spacing: 0.02em;
}

:deep(.el-input__inner::placeholder) {
  color: #4a5c6e;
}

:deep(.el-textarea__inner) {
  font-family: var(--nf-font-display);
  color: #c0cdd8;
  letter-spacing: 0.02em;
}
</style>
