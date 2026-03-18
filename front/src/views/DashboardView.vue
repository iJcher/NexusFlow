<!--
  管理后台仪表盘 - 流程统计与快速入口
-->
<template>
  <div class="max-w-300 mx-auto p-5">
    <div class="text-center py-10 px-5 rounded-3 mb-7.5 border border-[rgba(0,212,170,0.2)] welcome-banner">
      <h1 class="text-8 font-700 m-0 mb-3 nf-gradient-text">{{ t('dashboard.welcome') }}</h1>
      <p class="text-4 m-0 opacity-80 text-nf-text-secondary">{{ t('dashboard.greeting', { name: userInfo?.name || 'User' }) }}</p>
    </div>

    <div class="mb-7.5">
      <el-row :gutter="20">
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic :title="t('nav.logicFlow')" :value="logicFlowCount" :loading="loading">
              <template #prefix>
                <el-icon class="text-nf-accent"><Share /></el-icon>
              </template>
              <template #suffix>{{ t('dashboard.items') }}</template>
            </el-statistic>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic :title="t('nav.aiFlow')" :value="aiFlowCount" :loading="loading">
              <template #prefix>
                <el-icon class="text-nf-accent2"><MagicStick /></el-icon>
              </template>
              <template #suffix>{{ t('dashboard.items') }}</template>
            </el-statistic>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <el-statistic :title="t('nav.approvalFlow')" :value="approvalFlowCount" :loading="loading">
              <template #prefix>
                <el-icon class="text-[#38bdf8]"><CircleCheck /></el-icon>
              </template>
              <template #suffix>{{ t('dashboard.items') }}</template>
            </el-statistic>
          </el-card>
        </el-col>
      </el-row>
    </div>

    <el-card class="mt-5" shadow="never">
      <template #header>
        <h3 class="m-0 text-4.5 font-600 text-nf-text-primary">{{ t('dashboard.platformFeatures') }}</h3>
      </template>
      <el-row :gutter="20">
        <el-col :span="8">
          <div class="text-center p-5">
            <el-icon :size="32" color="#00d4aa"><Share /></el-icon>
            <h4 class="my-3 text-4 font-600 text-[#c9d1d9]">{{ t('nav.logicFlow') }}</h4>
            <p class="text-3.5 text-nf-text-secondary leading-relaxed m-0">{{ t('dashboard.logicFlowDesc') }}</p>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="text-center p-5">
            <el-icon :size="32" color="#00b4d8"><MagicStick /></el-icon>
            <h4 class="my-3 text-4 font-600 text-[#c9d1d9]">{{ t('nav.aiFlow') }}</h4>
            <p class="text-3.5 text-nf-text-secondary leading-relaxed m-0">{{ t('dashboard.aiFlowDesc') }}</p>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="text-center p-5">
            <el-icon :size="32" color="#38bdf8"><CircleCheck /></el-icon>
            <h4 class="my-3 text-4 font-600 text-[#c9d1d9]">{{ t('nav.approvalFlow') }}</h4>
            <p class="text-3.5 text-nf-text-secondary leading-relaxed m-0">{{ t('dashboard.approvalFlowDesc') }}</p>
          </div>
        </el-col>
      </el-row>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { Share, MagicStick, CircleCheck } from '@element-plus/icons-vue';
import { FlowService } from '@/services/flow.service';
import { FlowType } from '@/types/flow.types';

const { t } = useI18n();

const authStore = useAuthStore();
const userInfo = computed(() => authStore.getLoginUserInfo);

const logicFlowCount = ref(0);
const aiFlowCount = ref(0);
const approvalFlowCount = ref(0);
const loading = ref(true);

const loadStatistics = async () => {
  try {
    loading.value = true;
    
    const [logicResponse, aiResponse, approvalResponse] = await Promise.all([
      FlowService.getFlowList({ flowType: FlowType.LogicFlow, pageIndex: 1, pageSize: 1000 }),
      FlowService.getFlowList({ flowType: FlowType.AIFlow, pageIndex: 1, pageSize: 1000 }),
      FlowService.getFlowList({ flowType: FlowType.ApprovalFlow, pageIndex: 1, pageSize: 1000 })
    ]);
    
    if (logicResponse.errCode === 0 && logicResponse.data) {
      logicFlowCount.value = logicResponse.data.length;
    }
    if (aiResponse.errCode === 0 && aiResponse.data) {
      aiFlowCount.value = aiResponse.data.length;
    }
    if (approvalResponse.errCode === 0 && approvalResponse.data) {
      approvalFlowCount.value = approvalResponse.data.length;
    }
  } catch (error) {
    console.error('Failed to load statistics:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadStatistics();
});
</script>

<style scoped>
.welcome-banner {
  background: linear-gradient(135deg, #064e3b 0%, #065f46 40%, #047857 70%, #0d3b2e 100%);
}
</style>
