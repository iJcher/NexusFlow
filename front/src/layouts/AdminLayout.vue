<!--
  管理后台布局组件
  顶部 Tab 栏导航 + 主题色渐变背景 + 光斑点缀
-->
<template>
  <div class="admin-layout">
    <!-- 背景光斑装饰 -->
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-orb orb-3"></div>

    <!-- 顶部导航栏 -->
    <header class="top-bar">
      <div class="flex items-center gap-6">
        <h1 class="brand-text" @click="activeTab = 'ai-flow'">
          <span class="brand-nexus">Nexus</span><span class="brand-flow">Flow</span>
        </h1>

        <nav class="tab-nav">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            :class="['tab-item', { active: activeTab === tab.key }]"
            @click="activeTab = tab.key"
          >
            <el-icon :size="16"><component :is="tab.icon" /></el-icon>
            <span>{{ tab.label }}</span>
          </button>
        </nav>
      </div>

      <div class="flex items-center gap-3">
        <LanguageSwitcher />
        <span class="text-sm text-[#c9d1d9]">{{ userInfo?.name || t('layout.user') }}</span>
        <el-button type="danger" size="small" @click="handleLogout">
          {{ t('layout.logout') }}
        </el-button>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="main-content">
      <FlowList v-if="activeTab === 'logic-flow'" flow-type="logic" key="logic-flow" />
      <FlowList v-else-if="activeTab === 'ai-flow'" flow-type="ai" key="ai-flow" />
      <FlowList v-else-if="activeTab === 'approval-flow'" flow-type="approval" key="approval-flow" />
      <LLMProviderList v-else-if="activeTab === 'llm-provider'" key="llm-provider" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { Share, MagicStick, CircleCheck, Setting } from '@element-plus/icons-vue';

import FlowList from '@/views/flow/FlowList.vue';
import LLMProviderList from '@/views/llm/LLMProviderList.vue';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';

const { t } = useI18n();
const authStore = useAuthStore();

const activeTab = ref('ai-flow');
const userInfo = computed(() => authStore.getLoginUserInfo);

const tabs = computed(() => [
  { key: 'logic-flow', label: t('nav.logicFlow'), icon: markRaw(Share) },
  { key: 'ai-flow', label: t('nav.aiFlow'), icon: markRaw(MagicStick) },
  { key: 'approval-flow', label: t('nav.approvalFlow'), icon: markRaw(CircleCheck) },
  { key: 'llm-provider', label: t('layout.modelManagement'), icon: markRaw(Setting) },
]);

const handleLogout = () => {
  authStore.signOut();
};
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #080c12 0%, #0d1117 30%, #0a1628 60%, #0d1117 100%);
  position: relative;
  overflow: hidden;
}

/* ---- 背景光斑 ---- */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  pointer-events: none;
  z-index: 0;
}

.orb-1 {
  width: 700px;
  height: 700px;
  background: radial-gradient(circle, rgba(0, 212, 170, 0.18) 0%, rgba(0, 212, 170, 0.06) 35%, transparent 65%);
  top: -200px;
  left: -100px;
  animation: orbFloat1 20s ease-in-out infinite;
}

.orb-2 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, rgba(0, 180, 216, 0.15) 0%, rgba(0, 180, 216, 0.04) 35%, transparent 65%);
  bottom: -150px;
  right: -100px;
  animation: orbFloat2 25s ease-in-out infinite;
}

.orb-3 {
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(0, 212, 170, 0.12) 0%, rgba(0, 212, 170, 0.03) 35%, transparent 65%);
  top: 50%;
  left: 60%;
  animation: orbFloat3 18s ease-in-out infinite;
}

@keyframes orbFloat1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(60px, 40px) scale(1.15); }
}

@keyframes orbFloat2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-50px, -30px) scale(1.1); }
}

@keyframes orbFloat3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-40px, 30px) scale(1.2); }
}

/* ---- 顶部栏 ---- */
.top-bar {
  position: relative;
  z-index: 10;
  height: 56px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(13, 17, 23, 0.7);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(33, 38, 45, 0.6);
  flex-shrink: 0;
}

/* ---- 品牌文字 ---- */
.brand-text {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;
  user-select: none;
  position: relative;
}

.brand-nexus {
  background: linear-gradient(135deg, #e7e9ea, #c9d1d9);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-flow {
  background: linear-gradient(135deg, #00d4aa, #00b4d8);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  position: relative;
}

.brand-text::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #00d4aa, #00b4d8, transparent);
  opacity: 0;
  transition: opacity 0.3s ease;
}

.brand-text:hover::after {
  opacity: 1;
}

/* ---- Tab 导航 ---- */
.tab-nav {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #8b949e;
  font-size: 13.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
  white-space: nowrap;
  position: relative;
}

.tab-item:hover {
  color: #e7e9ea;
  background: rgba(255, 255, 255, 0.04);
}

.tab-item.active {
  color: #00d4aa;
  background: rgba(0, 212, 170, 0.1);
}

.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  background: #00d4aa;
  border-radius: 1px;
}

/* ---- 主内容 ---- */
.main-content {
  position: relative;
  z-index: 1;
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* ---- 滚动条 ---- */
.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: rgba(47, 51, 54, 0.6);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
</style>
