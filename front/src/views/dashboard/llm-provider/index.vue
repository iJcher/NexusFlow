<!--
  大模型提供者管理页面
-->
<template>
  <div class="nf-page">
    <div class="nf-page-header">
      <h2 class="nf-page-title">{{ t('llmProviderMgmt.title') }}</h2>
      <el-button type="primary" :icon="Plus" @click="createProvider">{{ t('llmProviderMgmt.add') }}</el-button>
    </div>

    <el-table 
      :data="providerList" 
      v-loading="loading"
      stripe
      style="width: 100%"
    >
      <el-table-column prop="id" :label="t('llmProviderMgmt.id')" width="150" />
      <el-table-column prop="platformName" :label="t('llmProviderMgmt.platformName')" width="80" />
      <el-table-column :label="t('llmProviderMgmt.modelNames')" min-width="300">
        <template #default="{ row }">
          <el-tag 
            v-for="(name, index) in row.llmNames" 
            :key="index" 
            size="small"
            class="mr-1.5 mb-1"
          >
            {{ name }}
          </el-tag>
          <span v-if="!row.llmNames || row.llmNames.length === 0" class="text-nf-text-muted">{{ t('llmProviderMgmt.notSet') }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="llmapiUrl" :label="t('llmProviderMgmt.apiUrl')" min-width="200" show-overflow-tooltip />
      <el-table-column :label="t('llmProviderMgmt.apiKey')" width="200">
        <template #default="{ row }">
          <div class="flex items-center gap-2">
            <span class="font-mono text-nf-text-secondary text-3.25">{{ maskApiKey(row.llmapiKey) }}</span>
            <el-button 
              text 
              type="primary" 
              :icon="CopyDocument" 
              size="small"
              @click="copyApiKey(row.llmapiKey)"
              :title="t('llmProviderMgmt.copyApiKey')"
            />
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('llmProviderMgmt.operation')" width="230" fixed="right">
        <template #default="{ row }">
          <el-button text type="primary" :icon="Edit" @click="editProvider(row)">{{ t('llmProviderMgmt.edit') }}</el-button>
          <el-button text type="danger" :icon="Delete" @click="deleteProvider(row)">{{ t('llmProviderMgmt.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

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
      <el-form :model="formData" label-width="100px" ref="formRef" :rules="formRules">
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
              @close="removeModelName(index)"
              class="mr-1.5 mb-1.5"
            >
              {{ name }}
            </el-tag>
          </div>
          <el-input
            v-model="newModelName"
            :placeholder="t('llmProviderMgmt.modelPlaceholder')"
            @keyup.enter="addModelName"
            clearable
          >
            <template #append>
              <el-button :icon="Plus" @click="addModelName">{{ t('llmProviderMgmt.addModel') }}</el-button>
            </template>
          </el-input>
          <div class="text-nf-text-muted text-3 mt-1">
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
        <el-button @click="dialogVisible = false">{{ t('llmProviderMgmt.cancel') }}</el-button>
        <el-button type="primary" @click="saveProvider" :loading="saving">{{ t('llmProviderMgmt.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Plus, Edit, Delete, CopyDocument } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { LLMProviderService } from '@/services/llmProvider.service';
import type { IFlowLLMProviderDto } from '@/types/llmProvider.types';

const { t } = useI18n();

const providerList = ref<IFlowLLMProviderDto[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const editingProvider = ref<IFlowLLMProviderDto | null>(null);
const saving = ref(false);

const formRef = ref<FormInstance>();

const formData = ref({
  platformName: '',
  llmNames: [] as string[],
  llmapiUrl: '',
  llmapiKey: ''
});

const newModelName = ref('');

const formRules: FormRules = {
  platformName: [
    { required: true, message: t('llmProviderMgmt.platformNameRequired'), trigger: 'blur' }
  ],
  llmNames: [
    {
      validator: (rule, value, callback) => {
        if (!value || value.length === 0) {
          callback(new Error(t('llmProviderMgmt.modelNameRequired')));
        } else {
          callback();
        }
      },
      trigger: 'change'
    }
  ],
  llmapiUrl: [
    { required: true, message: t('llmProviderMgmt.apiUrlRequired'), trigger: 'blur' },
    { type: 'url', message: t('llmProviderMgmt.apiUrlInvalid'), trigger: 'blur' }
  ],
  llmapiKey: [
    { required: true, message: t('llmProviderMgmt.apiKeyRequired'), trigger: 'blur' }
  ]
};

const loadProviderList = async () => {
  try {
    loading.value = true;
    const response = await LLMProviderService.getProviderList();
    
    if (response.errCode === 0 && response.data) {
      providerList.value = response.data;
    } else {
      ElMessage.error(response.errMsg || t('llmProviderMgmt.loadFailed'));
    }
  } catch (error) {
    console.error('Failed to load LLM provider list:', error);
    ElMessage.error(t('llmProviderMgmt.loadFailed'));
  } finally {
    loading.value = false;
  }
};

const createProvider = () => {
  editingProvider.value = null;
  formData.value = {
    platformName: '',
    llmNames: [],
    llmapiUrl: '',
    llmapiKey: ''
  };
  newModelName.value = '';
  dialogVisible.value = true;
};

const editProvider = (provider: IFlowLLMProviderDto) => {
  editingProvider.value = provider;
  formData.value = {
    platformName: provider.platformName || '',
    llmNames: provider.llmNames ? [...provider.llmNames] : [],
    llmapiUrl: provider.llmapiUrl || '',
    llmapiKey: provider.llmapiKey || ''
  };
  newModelName.value = '';
  dialogVisible.value = true;
};

const saveProvider = async () => {
  if (!formRef.value) return;
  
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;

  try {
    saving.value = true;
    
    if (editingProvider.value && editingProvider.value.id) {
      const response = await LLMProviderService.updateProvider({
        id: editingProvider.value.id,
        platformName: formData.value.platformName,
        llmNames: formData.value.llmNames,
        llmapiUrl: formData.value.llmapiUrl,
        llmapiKey: formData.value.llmapiKey
      });
      
      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.updateSuccess'));
        await loadProviderList();
        dialogVisible.value = false;
      } else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.updateFailed'));
      }
    } else {
      const response = await LLMProviderService.createProvider({
        platformName: formData.value.platformName,
        llmNames: formData.value.llmNames,
        llmapiUrl: formData.value.llmapiUrl,
        llmapiKey: formData.value.llmapiKey
      });
      
      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.createSuccess'));
        await loadProviderList();
        dialogVisible.value = false;
      } else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.createFailed'));
      }
    }
  } catch (error) {
    console.error('Failed to save LLM provider:', error);
    ElMessage.error(t('llmProviderMgmt.saveFailed'));
  } finally {
    saving.value = false;
  }
};

const deleteProvider = async (provider: IFlowLLMProviderDto) => {
  ElMessageBox.confirm(t('llmProviderMgmt.deleteConfirm'), t('llmProviderMgmt.deleteHint'), {
    type: 'warning',
    confirmButtonText: t('llmProviderMgmt.confirm'),
    cancelButtonText: t('llmProviderMgmt.cancel')
  }).then(async () => {
    if (!provider.id) {
      ElMessage.warning(t('llmProviderMgmt.invalidProviderId'));
      return;
    }
    
    try {
      const response = await LLMProviderService.deleteProvider(provider.id);
      if (response.errCode === 0) {
        ElMessage.success(t('llmProviderMgmt.deleteSuccess'));
        await loadProviderList();
      } else {
        ElMessage.error(response.errMsg || t('llmProviderMgmt.deleteFailed'));
      }
    } catch (error) {
      console.error('Failed to delete LLM provider:', error);
      ElMessage.error(t('llmProviderMgmt.deleteFailed'));
    }
  }).catch(() => {});
};

const addModelName = () => {
  const name = newModelName.value.trim();
  if (!name) {
    ElMessage.warning(t('llmProviderMgmt.modelNameEmpty'));
    return;
  }
  
  if (formData.value.llmNames.includes(name)) {
    ElMessage.warning(t('llmProviderMgmt.modelNameDuplicate'));
    return;
  }
  
  formData.value.llmNames.push(name);
  newModelName.value = '';
  
  formRef.value?.validateField('llmNames');
};

const removeModelName = (index: number) => {
  formData.value.llmNames.splice(index, 1);
  formRef.value?.validateField('llmNames');
};

const copyApiKey = async (apiKey: string | undefined) => {
  if (!apiKey) {
    ElMessage.warning(t('llmProviderMgmt.apiKeyEmpty'));
    return;
  }
  
  try {
    await navigator.clipboard.writeText(apiKey);
    ElMessage.success(t('llmProviderMgmt.copySuccess'));
  } catch (error) {
    console.error('Copy failed:', error);
    ElMessage.error(t('llmProviderMgmt.copyFailed'));
  }
};

const maskApiKey = (apiKey: string | undefined) => {
  if (!apiKey) return t('llmProviderMgmt.notSet');
  if (apiKey.length <= 8) return '****';
  return `${apiKey.substring(0, 4)}****${apiKey.substring(apiKey.length - 4)}`;
};

onMounted(() => {
  loadProviderList();
});

watch(() => t('llmProviderMgmt.title'), () => {});
</script>
