<!--
  统一流程列表页
  支持逻辑流程、AI流程、审批流程
-->
<template>
  <div class="nf-page">
    <div class="nf-page-header">
      <h2 class="nf-page-title">{{ t(`nav.${flowTypeMap[props.flowType]}`) }}</h2>
      <el-button type="primary" :icon="Plus" @click="createFlow">{{ t(`flowList.create${flowTypeMap[props.flowType].charAt(0).toUpperCase() + flowTypeMap[props.flowType].slice(1)}`) }}</el-button>
    </div>

    <el-card class="nf-card rounded-1" shadow="never">
      <template #default>
        <el-table 
          :data="flowList" 
          v-loading="loading"
          stripe
          style="width: 100%"
          @row-dblclick="handleRowDblClick"
        >
          <el-table-column prop="id" :label="t('flowList.id')" width="160" />
          
          <el-table-column prop="displayName" :label="t('flowList.flowName')" min-width="180">
            <template #default="{ row }">
              <div class="flex items-center">
                <span>{{ row.displayName }}</span>
                <el-tag v-if="flowConfig.showTag" size="small" :type="flowConfig.tagType" class="ml-2">
                  {{ flowConfig.tagText === 'AI' ? 'AI' : t('nav.approvalFlow') }}
                </el-tag>
              </div>
            </template>
          </el-table-column>
          
          <el-table-column prop="description" :label="t('flowList.description')" min-width="100" show-overflow-tooltip>
            <template #default="{ row }">
              {{ row.description || t('flowList.noDescription') }}
            </template>
          </el-table-column>
        
          
          <el-table-column prop="lastModified" :label="t('flowList.lastModified')" width="200">
            <template #default="{ row }">
              {{ formatDateTime(row.lastModified) }} -
              {{ row.lastModifyBy }}
            </template>
          </el-table-column>
          
          <el-table-column :label="t('flowList.operation')" width="300" fixed="right">
            <template #default="{ row }">
              <el-button type="primary" link :icon="Edit" @click="openDesigner(row.id)">
                {{ t('flowList.design') }}
              </el-button>
              <el-button type="primary" link :icon="Edit" @click="handleEdit(row)">
                {{ t('flowList.edit') }}
              </el-button>
              <el-button type="info" link :icon="DocumentCopy" @click="handleCopy(row)">
                {{ t('flowList.copy') }}
              </el-button>
              <el-button type="danger" link :icon="Delete" @click="handleDelete(row)">
                {{ t('flowList.delete') }}
              </el-button>
            </template>
          </el-table-column>
          
          <template #empty>
            <el-empty :description="t(`flowList.empty${flowTypeMap[props.flowType].charAt(0).toUpperCase() + flowTypeMap[props.flowType].slice(1)}`)" />
          </template>
        </el-table>
        
        <el-pagination
          v-if="total > 0"
          v-model:current-page="pagination.pageIndex"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
          class="flex justify-end p-4 bg-nf-card border-t border-nf-border"
        />
      </template>
    </el-card>

    <el-dialog 
      v-model="dialogVisible" 
      :title="editingFlow ? t('flowList.editTitle', { type: t(`nav.${flowTypeMap[props.flowType]}`) }) : t('flowList.createTitle', { type: t(`nav.${flowTypeMap[props.flowType]}`) })"
      width="500px"
    >
      <el-form :model="formData" label-width="80px">
        <el-form-item :label="t('flowList.flowName')" required>
          <el-input v-model="formData.name" :placeholder="t('flowList.enterFlowName')" />
        </el-form-item>
        <el-form-item :label="t('flowList.description')">
          <el-input 
            v-model="formData.description" 
            type="textarea" 
            :rows="3"
            :placeholder="t('flowList.enterFlowDesc')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('flowList.cancel') }}</el-button>
        <el-button type="primary" @click="saveFlow">{{ t('flowList.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Plus, Edit, Delete, DocumentCopy, MagicStick, CircleCheck } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { FlowService } from '@/services/flow.service';
import { FlowType, type IFlowDto } from '@/types/flow.types';

const { t } = useI18n();
const router = useRouter();

interface Props {
  flowType: 'logic' | 'ai' | 'approval';
}

const props = defineProps<Props>();

const flowTypeMap: Record<string, string> = {
  logic: 'logicFlow',
  ai: 'aiFlow',
  approval: 'approvalFlow'
};

const flowConfig = computed(() => {
  const configs = {
    logic: {
      flowTypeEnum: FlowType.LogicFlow,
      designerRoute: 'logic',
      showTag: false,
      tagType: '',
      tagText: ''
    },
    ai: {
      flowTypeEnum: FlowType.AIFlow,
      designerRoute: 'ai',
      showTag: true,
      tagType: 'warning',
      tagText: 'AI'
    },
    approval: {
      flowTypeEnum: FlowType.ApprovalFlow,
      designerRoute: 'approval',
      showTag: true,
      tagType: 'success',
      tagText: '审批'
    }
  };
  
  return configs[props.flowType] || configs.logic;
});

const flowList = ref<IFlowDto[]>([]);
const loading = ref(false);
const total = ref(0);

const pagination = ref({
  pageIndex: 1,
  pageSize: 20
});

const dialogVisible = ref(false);
const editingFlow = ref<IFlowDto | null>(null);
const formData = ref({
  name: '',
  description: ''
});

const loadFlowList = async () => {
  try {
    loading.value = true;
    const response = await FlowService.getFlowList({
      flowType: flowConfig.value.flowTypeEnum,
      pageIndex: pagination.value.pageIndex,
      pageSize: pagination.value.pageSize
    });
    
    if (response.errCode === 0 && response.data) {
      flowList.value = response.data;
      total.value = flowList.value.length;
    } else {
      ElMessage.error(response.errMsg || t('flowList.loadFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
    }
  } catch (error) {
    console.error(`Failed to load flow list:`, error);
    ElMessage.error(t('flowList.loadFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
  } finally {
    loading.value = false;
  }
};

const createFlow = () => {
  editingFlow.value = null;
  formData.value = { name: '', description: '' };
  dialogVisible.value = true;
};

const saveFlow = async () => {
  if (!formData.value.name) {
    ElMessage.warning(t('flowList.flowNameRequired'));
    return;
  }

  try {
    if (editingFlow.value && editingFlow.value.id) {
      const response = await FlowService.updateFlow({
        id: editingFlow.value.id,
        displayName: formData.value.name,
        description: formData.value.description
      });
      
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.updateSuccess', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
        await loadFlowList();
      } else {
        ElMessage.error(response.errMsg || t('flowList.updateFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
        return;
      }
    } else {
      const response = await FlowService.createFlow({
        displayName: formData.value.name,
        flowType: flowConfig.value.flowTypeEnum,
        description: formData.value.description
      });
      
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.createSuccess', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
        await loadFlowList();
      } else {
        ElMessage.error(response.errMsg || t('flowList.createFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
        return;
      }
    }

    dialogVisible.value = false;
  } catch (error) {
    console.error(`Failed to save flow:`, error);
    ElMessage.error(t('flowList.createFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
  }
};

const openDesigner = (id: number | null | undefined) => {
  if (!id) {
    ElMessage.warning(t('flowList.invalidFlowId'));
    return;
  }
  const route = `/designer/${flowConfig.value.designerRoute}/${id}`;
  router.push(route);
};

const handleEdit = (flow: IFlowDto) => {
  editingFlow.value = flow;
  formData.value = {
    name: flow.displayName || '',
    description: flow.description || ''
  };
  dialogVisible.value = true;
};

const handleCopy = async (flow: IFlowDto) => {
  try {
    const response = await FlowService.createFlow({
      displayName: `${flow.displayName || t('flowList.unnamedFlow')} - ${t('flowList.copySuffix')}`,
      flowType: flow.flowType || flowConfig.value.flowTypeEnum,
      description: flow.description ?? undefined,
      configInfoForRun: flow.configInfoForRun ?? undefined,
      configInfoForWeb: flow.configInfoForWeb ?? undefined
    });
    
    if (response.errCode === 0) {
      ElMessage.success(t('flowList.copySuccess', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
      await loadFlowList();
    } else {
      ElMessage.error(response.errMsg || t('flowList.copyFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
    }
  } catch (error) {
    console.error(`Failed to copy flow:`, error);
    ElMessage.error(t('flowList.copyFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
  }
};

const handleDelete = async (flow: IFlowDto) => {
  ElMessageBox.confirm(t('flowList.deleteConfirm', { name: flow.displayName }), t('flowList.deleteHint'), {
    type: 'warning',
    confirmButtonText: t('flowList.confirm'),
    cancelButtonText: t('flowList.cancel')
  }).then(async () => {
    if (!flow.id) {
      ElMessage.warning(t('flowList.invalidFlowId'));
      return;
    }
    
    try {
      const response = await FlowService.deleteFlow(flow.id);
      if (response.errCode === 0) {
        ElMessage.success(t('flowList.deleteSuccess', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
        await loadFlowList();
      } else {
        ElMessage.error(response.errMsg || t('flowList.deleteFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
      }
    } catch (error) {
      console.error(`Failed to delete flow:`, error);
      ElMessage.error(t('flowList.deleteFailed', { type: t(`nav.${flowTypeMap[props.flowType]}`) }));
    }
  }).catch(() => {});
};

const handleSizeChange = () => {
  pagination.value.pageIndex = 1;
  loadFlowList();
};

const handleCurrentChange = () => {
  loadFlowList();
};

const handleRowDblClick = (row: IFlowDto) => {
  openDesigner(row.id);
};

const formatDateTime = (dateStr: string | null | undefined) => {
  if (!dateStr) return '-';
  
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const getFlowTypeName = (): string => {
  return t(`nav.${flowTypeMap[props.flowType]}`);
};

onMounted(() => {
  loadFlowList();
});

watch(() => props.flowType, () => {
  pagination.value.pageIndex = 1;
  loadFlowList();
});

watch(() => t('flowList.id'), () => {});
</script>

<style scoped>
:deep(.el-card__body) {
  padding: 0;
}

:deep(.el-table__row) {
  cursor: pointer;
}
</style>
