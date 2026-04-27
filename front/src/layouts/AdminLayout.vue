<template>
  <div class="admin-layout">
    <header class="topbar">
      <div class="topbar-inner">
        <div class="topbar-left" @click="$router.push('/studio')">
          <img src="@/assets/images/logo.png" alt="NexusFlow" class="topbar-logo" />
        </div>

        <nav class="topbar-nav">
          <router-link
            v-for="tab in tabs"
            :key="tab.path"
            :to="tab.path"
            :class="['nav-tab', { active: isActive(tab.path) }]"
          >
            <el-icon :size="16"><component :is="tab.icon" /></el-icon>
            <span>{{ tab.label }}</span>
          </router-link>
        </nav>

        <div class="topbar-right">
          <LanguageSwitcher />
          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-avatar">
              <img :src="defaultAvatarImage" alt="" class="user-avatar-img" />
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  {{ userInfo?.name || t('layout.user') }}
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  {{ t('layout.logout') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <main class="main-content">
      <div class="content-container">
        <router-view />
      </div>
    </main>

    <footer class="app-footer">
      <span>{{ t('layout.copyright') }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { DataBoard, Files, Collection, Setting, SwitchButton } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import defaultAvatarImage from '@/assets/images/default.png'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const userInfo = computed(() => authStore.getLoginUserInfo)

const tabs = computed(() => [
  { path: '/studio', label: t('nav.studio'), icon: markRaw(DataBoard) },
  { path: '/templates', label: t('nav.templates'), icon: markRaw(Files) },
  { path: '/knowledge', label: t('nav.knowledge'), icon: markRaw(Collection) },
  { path: '/models', label: t('nav.models'), icon: markRaw(Setting) },
])

const isActive = (path: string) => route.path === path || route.path.startsWith(path + '/')

const handleCommand = (command: string) => {
  if (command === 'logout') {
    authStore.signOut()
  }
}
</script>

<style scoped>
.admin-layout {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: var(--nf-bg-base);
  overflow: hidden;
}

/* ── Topbar ── */
.topbar {
  height: 56px;
  flex-shrink: 0;
  background: var(--nf-bg-card);
  border-bottom: 1px solid var(--nf-border);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
}

.topbar-inner {
  height: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 32px;
  display: flex;
  align-items: center;
  gap: 32px;
}

.topbar-left {
  height: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.topbar-logo {
  height: 100%;
  object-fit: contain;
}

.topbar-brand {
  font-family: 'DongFangDaKai', sans-serif;
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.brand-nexus {
  background: var(--nf-brand-nexus-gradient);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.brand-flow {
  background: var(--nf-brand-flow-gradient);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ── Navigation tabs ── */
.topbar-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 8px;
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.nav-tab:hover {
  color: var(--nf-text-primary);
  background: var(--nf-bg-elevated);
}

.nav-tab.active {
  color: var(--nf-accent);
  background: var(--nf-accent-muted);
}

/* ── Right side ── */
.topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.user-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.user-avatar:hover {
  opacity: 0.85;
  transform: translateY(-1px);
}

/* ── Main content ── */
.main-content {
  flex: 1;
  overflow-y: auto;
}

.content-container {
  max-width: 1440px;
  margin: 0 auto;
}

.main-content::-webkit-scrollbar {
  width: 6px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--nf-scrollbar);
  border-radius: 3px;
}

.main-content::-webkit-scrollbar-thumb:hover {
  background: var(--nf-scrollbar-hover);
}

/* ── Footer ── */
.app-footer {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid var(--nf-border);
  background: var(--nf-bg-card);
  font-family: var(--nf-font-display);
  font-size: 12px;
  color: var(--nf-text-muted);
  letter-spacing: 0.02em;
}
</style>
