<template>
  <el-dropdown
    trigger="click"
    @command="handleCommand"
    @visible-change="handleVisibleChange"
  >
    <el-button class="flex items-center gap-1 font-500 text-nf-text-primary" :loading="isLoading" text>
      {{ t('flowDesigner.executionLog') }}
      <el-icon class="el-icon--right">
        <ArrowDown />
      </el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu class="w-90 max-h-90 overflow-y-auto py-2">
        <template v-if="executionLogs.length">
          <el-dropdown-item
            v-for="log in executionLogs"
            :key="log.flowInstanceId"
            :command="log.flowInstanceId"
            class="whitespace-normal"
          >
            <div class="flex flex-col gap-1.5">
              <div class="flex-between text-sm text-nf-text-primary">
                <span class="font-600">{{ log.displayName || t('flowDesigner.unnamedRun') }}</span>
                <el-tag size="small" :type="log.isSuccess ? 'success' : 'danger'">
                  {{ log.isSuccess ? t('common.success') : t('common.failed') }}
                </el-tag>
              </div>
              <div class="flex flex-col text-3 text-nf-text-secondary gap-0.5">
                <span>{{ formatDatetime(log.createdTime) }}</span>
                <span>{{ t('flowDesigner.duration') }}{{ formatDuration(log.runDurationMs) }}</span>
                <span>{{ t('flowDesigner.user') }}{{ log.runUser || t('flowDesigner.system') }}</span>
              </div>
            </div>
          </el-dropdown-item>
        </template>
        <el-dropdown-item v-else disabled class="text-nf-text-muted cursor-default">
          {{ t('flowDesigner.noExecutionLogs') }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { ArrowDown } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { FlowService } from '@/services/flow.service';
import type { IFlowRunLogDto } from '@/types/flow.types';

const props = withDefaults(defineProps<{
  flowId?: number | null;
}>(), {
  flowId: null
});

const executionLogs = ref<IFlowRunLogDto[]>([]);
const isLoading = ref(false);
const router = useRouter();
const { t } = useI18n();

const hasFlowId = computed(() => typeof props.flowId === 'number' && !Number.isNaN(props.flowId));

const formatDatetime = (value?: string | null) => {
  if (!value) return '--';
  return new Date(value).toLocaleString();
};

const formatDuration = (value?: number | null) => {
  if (!value || value <= 0) return '--';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
};

const fetchExecutionLogs = async () => {
  if (!hasFlowId.value) {
    executionLogs.value = [];
    return;
  }

  try {
    isLoading.value = true;
    const response = await FlowService.getExecutionLogsByFlowId(props.flowId as number);
    if (response.errCode === 0) {
      executionLogs.value = response.data ?? [];
    } else {
      executionLogs.value = [];
      ElMessage.error(response.errMsg || t('flowDesigner.fetchLogsFailed'));
    }
  } catch (error) {
    console.error('Fetch execution logs failed:', error);
    executionLogs.value = [];
    ElMessage.error(t('flowDesigner.fetchLogsFailed'));
  } finally {
    isLoading.value = false;
  }
};

const openRunLogWindow = (logId: number) => {
  if (!hasFlowId.value) {
    ElMessage.warning(t('flowDesigner.saveFlowFirst'));
    return;
  }

  router.push({
    name: 'flowRunLogViewer',
    params: {
      flowId: props.flowId,
      logId
    }
  });
};

const handleCommand = (command: number | string | Record<string, number>) => {
  const id = typeof command === 'object'
    ? Number((command as Record<string, number>).id)
    : Number(command);

  if (!Number.isNaN(id)) {
    openRunLogWindow(id);
  }
};

const handleVisibleChange = (visible: boolean) => {
  if (visible) {
    fetchExecutionLogs();
  }
};

watch(() => props.flowId, () => {
  executionLogs.value = [];
});
</script>
