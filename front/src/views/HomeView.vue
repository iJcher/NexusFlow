<!--
  NexusFlow 首页 - 产品介绍着陆页
-->
<template>
  <div class="landing-page">
    <!-- 背景光斑 -->
    <div class="bg-orb orb-1"></div>
    <div class="bg-orb orb-2"></div>
    <div class="bg-orb orb-3"></div>
    <div class="bg-orb orb-4"></div>

    <!-- 导航栏 -->
    <header class="nav-bar">
      <div class="nav-inner">
        <div></div>
        <div class="nav-actions">
          <LanguageSwitcher />
          <el-button v-if="isAuthenticated" type="primary" @click="enterDashboard">
            {{ t('home.enterDashboard') }}
          </el-button>
          <el-button v-else type="primary" @click="goLogin">
            {{ t('home.login') }}
          </el-button>
        </div>
      </div>
    </header>

    <!-- Hero 区域 -->
    <section class="hero-section">
      <!-- 品牌区：吉祥物 + 大字（类似 OpenClaw 首页风格） -->
      <div class="hero-brand">
        <img src="@/assets/images/NexusFLow-transparent.png" alt="NexusFlow Mascot" class="hero-mascot" />
        <div class="hero-brand-text">
          <h1 class="hero-brand-name">
            <span class="brand-nexus">Nexus</span><span class="brand-flow">Flow</span>
          </h1>
          <p class="hero-brand-tagline">{{ t('home.badge') }}</p>
        </div>
      </div>

      <!-- 标语与按钮 -->
      <div class="hero-body">
        <h2 class="hero-title">{{ t('home.heroTitle') }}</h2>
        <p class="hero-subtitle">{{ t('home.heroSubtitle') }}</p>
        <div class="hero-actions">
          <el-button type="primary" size="large" @click="handleGetStarted" class="hero-btn-primary">
            {{ t('home.getStarted') }}
          </el-button>
          <el-button size="large" @click="scrollToFeatures" class="hero-btn-secondary">
            {{ t('home.learnMore') }}
          </el-button>
        </div>
      </div>

      <!-- 流程演示卡片 -->
      <div class="hero-card-wrapper">
        <div class="hero-card">
          <div class="card-header">
            <span class="card-dot red"></span>
            <span class="card-dot yellow"></span>
            <span class="card-dot green"></span>
            <span class="card-title">flow-designer.vue</span>
          </div>
          <div class="card-body">
            <div class="flow-demo">
              <div class="flow-node start-node">
                <div class="flow-node-icon">▶</div>
                <span>Start</span>
              </div>
              <div class="flow-arrow">→</div>
              <div class="flow-node llm-node">
                <div class="flow-node-icon">🤖</div>
                <span>LLM</span>
              </div>
              <div class="flow-arrow">→</div>
              <div class="flow-node condition-node">
                <div class="flow-node-icon">◆</div>
                <span>Condition</span>
              </div>
              <div class="flow-branch">
                <div class="flow-node reply-node">
                  <div class="flow-node-icon">💬</div>
                  <span>Reply</span>
                </div>
                <div class="flow-node code-node">
                  <div class="flow-node-icon">⚡</div>
                  <span>JS Code</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能特性 -->
    <section id="features" class="features-section">
      <div class="section-inner">
        <h3 class="section-title">{{ t('home.featuresTitle') }}</h3>
        <p class="section-subtitle">{{ t('home.featuresSubtitle') }}</p>
        <div class="features-grid">
          <div class="feature-card" v-for="feature in features" :key="feature.key">
            <div class="feature-icon" :class="feature.iconClass">
              <component :is="feature.icon" />
            </div>
            <h4 class="feature-name">{{ t(`home.feature_${feature.key}_title`) }}</h4>
            <p class="feature-desc">{{ t(`home.feature_${feature.key}_desc`) }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 节点类型展示 -->
    <section class="nodes-section">
      <div class="section-inner">
        <h3 class="section-title">{{ t('home.nodesTitle') }}</h3>
        <p class="section-subtitle">{{ t('home.nodesSubtitle') }}</p>
        <div class="nodes-grid">
          <div class="node-card" v-for="node in nodeTypes" :key="node.name">
            <div class="node-icon" :style="{ background: node.gradient }">
              {{ node.emoji }}
            </div>
            <span class="node-name">{{ node.name }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 快速开始 -->
    <section class="quickstart-section">
      <div class="section-inner">
        <h3 class="section-title">{{ t('home.quickstartTitle') }}</h3>
        <p class="section-subtitle">{{ t('home.quickstartSubtitle') }}</p>
        <div class="steps-grid">
          <div class="step-card" v-for="(step, index) in 3" :key="index">
            <div class="step-number">{{ index + 1 }}</div>
            <h4 class="step-title">{{ t(`home.step${index + 1}_title`) }}</h4>
            <p class="step-desc">{{ t(`home.step${index + 1}_desc`) }}</p>
          </div>
        </div>
        <div class="cta-area">
          <el-button type="primary" size="large" @click="handleGetStarted" class="hero-btn-primary">
            {{ t('home.startNow') }}
          </el-button>
        </div>
      </div>
    </section>

    <!-- 技术栈图标滚动装饰 -->
    <section class="marquee-section">
      <div class="marquee-track marquee-left">
        <div class="marquee-content">
          <img v-for="icon in marqueeRow1" :key="icon.name + '-a'" :src="icon.url" :alt="icon.name" :title="icon.name" class="marquee-icon" />
          <img v-for="icon in marqueeRow1" :key="icon.name + '-b'" :src="icon.url" :alt="icon.name" class="marquee-icon" />
        </div>
      </div>
      <div class="marquee-track marquee-right">
        <div class="marquee-content">
          <img v-for="icon in marqueeRow2" :key="icon.name + '-a'" :src="icon.url" :alt="icon.name" :title="icon.name" class="marquee-icon" />
          <img v-for="icon in marqueeRow2" :key="icon.name + '-b'" :src="icon.url" :alt="icon.name" class="marquee-icon" />
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="landing-footer">
      <div class="footer-inner">
        <div class="footer-brand">
          <img src="@/assets/images/NexusFLow-transparent.png" alt="NexusFlow" class="footer-logo-img" />
          <span class="footer-logo">
            <span class="brand-nexus">Nexus</span><span class="brand-flow">Flow</span>
          </span>
          <p class="footer-desc">{{ t('home.footerDesc') }}</p>
        </div>
        <div class="footer-links">
          <a href="https://github.com" target="_blank" rel="noopener">GitHub</a>
          <span class="footer-divider">·</span>
          <a href="#features">{{ t('home.featuresTitle') }}</a>
        </div>
        <p class="footer-copyright">© {{ new Date().getFullYear() }} - Jcher NexusFlow.</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { Share, MagicStick, CircleCheck, Setting, Monitor, Connection } from '@element-plus/icons-vue';
import LanguageSwitcher from '@/components/LanguageSwitcher.vue';

const { t } = useI18n();
const router = useRouter();
const authStore = useAuthStore();

const isAuthenticated = computed(() => authStore.getIsAuthenticated);

const features = [
  { key: 'visual', icon: markRaw(Monitor), iconClass: 'icon-visual' },
  { key: 'ai', icon: markRaw(MagicStick), iconClass: 'icon-ai' },
  { key: 'logic', icon: markRaw(Share), iconClass: 'icon-logic' },
  { key: 'approval', icon: markRaw(CircleCheck), iconClass: 'icon-approval' },
  { key: 'model', icon: markRaw(Setting), iconClass: 'icon-model' },
  { key: 'realtime', icon: markRaw(Connection), iconClass: 'icon-realtime' },
];

const nodeTypes = [
  { name: 'Start', emoji: '▶', gradient: 'linear-gradient(135deg, #06b6d4, #00d4aa)' },
  { name: 'LLM', emoji: '🤖', gradient: 'linear-gradient(135deg, #00b4d8, #0891b2)' },
  { name: 'Condition', emoji: '◆', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { name: 'Reply', emoji: '💬', gradient: 'linear-gradient(135deg, #0891b2, #0e7490)' },
  { name: 'JS Code', emoji: '⚡', gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' },
  { name: 'HTTP', emoji: '🌐', gradient: 'linear-gradient(135deg, #00b4d8, #0891b2)' },
  { name: 'Variable', emoji: '📦', gradient: 'linear-gradient(135deg, #38bdf8, #0284c7)' },
  { name: 'End', emoji: '⏹', gradient: 'linear-gradient(135deg, #6b7280, #4b5563)' },
];

const D = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons';

const marqueeRow1 = [
  { name: 'Vue.js', url: `${D}/vuejs/vuejs-original.svg` },
  { name: 'TypeScript', url: `${D}/typescript/typescript-original.svg` },
  { name: 'React', url: `${D}/react/react-original.svg` },
  { name: 'Next.js', url: `${D}/nextjs/nextjs-plain.svg` },
  { name: 'Node.js', url: `${D}/nodejs/nodejs-original.svg` },
  { name: 'Vite', url: `${D}/vitejs/vitejs-original.svg` },
  { name: 'TailwindCSS', url: `${D}/tailwindcss/tailwindcss-original.svg` },
  { name: 'Python', url: `${D}/python/python-original.svg` },
  { name: 'Docker', url: `${D}/docker/docker-original.svg` },
  { name: 'Git', url: `${D}/git/git-original.svg` },
  { name: 'Go', url: `${D}/go/go-original.svg` },
  { name: 'Rust', url: `${D}/rust/rust-original.svg` },
];

const marqueeRow2 = [
  { name: 'JavaScript', url: `${D}/javascript/javascript-original.svg` },
  { name: 'HTML5', url: `${D}/html5/html5-original.svg` },
  { name: 'CSS3', url: `${D}/css3/css3-original.svg` },
  { name: 'NestJS', url: `${D}/nestjs/nestjs-original.svg` },
  { name: 'PostgreSQL', url: `${D}/postgresql/postgresql-original.svg` },
  { name: 'MongoDB', url: `${D}/mongodb/mongodb-original.svg` },
  { name: 'Redis', url: `${D}/redis/redis-original.svg` },
  { name: 'GraphQL', url: `${D}/graphql/graphql-plain.svg` },
  { name: 'Figma', url: `${D}/figma/figma-original.svg` },
  { name: 'GitHub', url: `${D}/github/github-original.svg` },
  { name: 'npm', url: `${D}/npm/npm-original-wordmark.svg` },
  { name: 'Kubernetes', url: `${D}/kubernetes/kubernetes-original.svg` },
];

const handleGetStarted = () => {
  if (isAuthenticated.value) {
    enterDashboard();
  } else {
    goLogin();
  }
};

const enterDashboard = () => {
  router.push('/dashboard');
};

const goLogin = () => {
  router.push('/login');
};

const scrollToFeatures = () => {
  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
};
</script>

<style scoped>
.landing-page {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(160deg, #080c12 0%, #0d1117 25%, #0a1628 55%, #0d1117 100%);
  color: var(--nf-text-primary);
  overflow-x: hidden;
  position: relative;
}

/* =============== 背景光斑 =============== */
.bg-orb {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  z-index: 0;
}

.orb-1 {
  width: 800px;
  height: 800px;
  background: radial-gradient(circle, rgba(0, 212, 170, 0.28) 0%, rgba(0, 212, 170, 0.1) 35%, transparent 65%);
  filter: blur(60px);
  top: -250px;
  left: -200px;
  animation: orbDrift1 22s ease-in-out infinite;
}

.orb-2 {
  width: 650px;
  height: 650px;
  background: radial-gradient(circle, rgba(0, 180, 216, 0.24) 0%, rgba(0, 180, 216, 0.08) 35%, transparent 65%);
  filter: blur(50px);
  top: 30%;
  right: -180px;
  animation: orbDrift2 28s ease-in-out infinite;
}

.orb-3 {
  width: 550px;
  height: 550px;
  background: radial-gradient(circle, rgba(0, 212, 170, 0.2) 0%, rgba(0, 212, 170, 0.06) 35%, transparent 65%);
  filter: blur(50px);
  bottom: 15%;
  left: 5%;
  animation: orbDrift3 20s ease-in-out infinite;
}

.orb-4 {
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, rgba(0, 180, 216, 0.18) 0%, rgba(0, 180, 216, 0.05) 35%, transparent 65%);
  filter: blur(40px);
  top: 12%;
  left: 50%;
  animation: orbDrift4 25s ease-in-out infinite;
}

@keyframes orbDrift1 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(80px, 50px) scale(1.15); }
}

@keyframes orbDrift2 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-60px, -40px) scale(1.12); }
}

@keyframes orbDrift3 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(50px, -35px) scale(1.2); }
}

@keyframes orbDrift4 {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(-40px, 40px) scale(1.1); }
}

/* =============== 品牌文字 =============== */
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
}

/* =============== 导航栏 =============== */
.nav-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  background:transparent;
  border-bottom: 1px solid rgba(33, 38, 45, 0.4);
}

.nav-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* =============== Hero =============== */
.hero-section {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 60px 32px 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 48px;
}

/* 品牌区：吉祥物 + 大字 */
.hero-brand {
  display: flex;
  align-items: center;
  gap: 28px;
}

.hero-mascot {
  width: 140px;
  height: 140px;
  object-fit: contain;
  animation: mascotFloat 5s ease-in-out infinite;
  filter: drop-shadow(0 8px 24px rgba(0, 212, 170, 0.2));
}

@keyframes mascotFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.hero-brand-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-brand-name {
  font-size: 64px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 1px;
  line-height: 1;
}

.hero-brand-tagline {
  font-size: 15px;
  font-weight: 500;
  color: #00d4aa;
  margin: 0;
  letter-spacing: 0.5px;
  padding-left: 4px;
}

/* 标语与按钮 */
.hero-body {
  text-align: center;
  max-width: 700px;
}

.hero-title {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 16px;
  background: linear-gradient(135deg, #e7e9ea 0%, #00d4aa 60%, #00b4d8 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hero-subtitle {
  font-size: 17px;
  line-height: 1.7;
  color: var(--nf-text-secondary);
  margin: 0 0 28px;
}

.hero-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.hero-btn-primary {
  padding: 12px 32px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  border-radius: 8px !important;
  background: linear-gradient(135deg, #00d4aa, #00b4d8) !important;
  border: none !important;
  transition: all 0.3s ease !important;
}

.hero-btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 212, 170, 0.3) !important;
}

.hero-btn-secondary {
  padding: 12px 32px !important;
  font-size: 15px !important;
  font-weight: 500 !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(47, 51, 54, 0.8) !important;
  color: var(--nf-text-primary) !important;
}

.hero-btn-secondary:hover {
  border-color: #00d4aa !important;
  color: #00d4aa !important;
}

/* 流程演示卡片 */
.hero-card-wrapper {
  width: 100%;
  display: flex;
  justify-content: center;
}

.hero-card {
  width: 100%;
  max-width: 580px;
  background: rgba(22, 27, 34, 0.7);
  border: 1px solid rgba(33, 38, 45, 0.6);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
}

.card-header {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(28, 33, 40, 0.8);
  border-bottom: 1px solid rgba(33, 38, 45, 0.5);
}

.card-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.card-dot.red { background: #ff5f57; }
.card-dot.yellow { background: #febc2e; }
.card-dot.green { background: #28c840; }

.card-title {
  font-size: 12px;
  color: var(--nf-text-secondary);
  margin-left: 8px;
}

.card-body {
  padding: 32px 24px;
}

.flow-demo {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: center;
}

.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 16px;
  background: rgba(28, 33, 40, 0.8);
  border: 1px solid rgba(33, 38, 45, 0.6);
  border-radius: 8px;
  font-size: 12px;
  color: var(--nf-text-primary);
  min-width: 72px;
  transition: all 0.3s ease;
}

.flow-node:hover {
  border-color: #00d4aa;
  box-shadow: 0 0 15px rgba(0, 212, 170, 0.15);
  transform: translateY(-2px);
}

.flow-node-icon {
  font-size: 18px;
}

.flow-arrow {
  color: #484f58;
  font-size: 18px;
  font-weight: 300;
}

.flow-branch {
  display: flex;
  gap: 12px;
}

/* =============== 通用 Section =============== */
.features-section,
.nodes-section,
.quickstart-section {
  position: relative;
  z-index: 1;
}

.features-section {
  background: rgba(22, 27, 34, 0.4);
  backdrop-filter: blur(8px);
  border-top: 1px solid rgba(33, 38, 45, 0.4);
  border-bottom: 1px solid rgba(33, 38, 45, 0.4);
  padding: 100px 0;
}

.section-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
}

.section-title {
  text-align: center;
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 12px;
  color: var(--nf-text-primary);
}

.section-subtitle {
  text-align: center;
  font-size: 16px;
  color: var(--nf-text-secondary);
  margin: 0 0 56px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}

.feature-card {
  padding: 32px 28px;
  background: rgba(13, 17, 23, 0.5);
  border: 1px solid rgba(33, 38, 45, 0.5);
  border-radius: 12px;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
}

.feature-card:hover {
  border-color: rgba(0, 212, 170, 0.3);
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2), 0 0 30px rgba(0, 212, 170, 0.05);
}

.feature-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  font-size: 24px;
  color: #fff;
}

.icon-visual { background: linear-gradient(135deg, #00d4aa, #00b4d8); }
.icon-ai { background: linear-gradient(135deg, #00b4d8, #0891b2); }
.icon-logic { background: linear-gradient(135deg, #06b6d4, #00d4aa); }
.icon-approval { background: linear-gradient(135deg, #38bdf8, #0284c7); }
.icon-model { background: linear-gradient(135deg, #f59e0b, #d97706); }
.icon-realtime { background: linear-gradient(135deg, #a78bfa, #7c3aed); }

.feature-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--nf-text-primary);
}

.feature-desc {
  font-size: 14px;
  color: var(--nf-text-secondary);
  line-height: 1.7;
  margin: 0;
}

/* =============== 节点类型 =============== */
.nodes-section {
  padding: 100px 0;
}

.nodes-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16px;
}

.node-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid rgba(33, 38, 45, 0.5);
  border-radius: 10px;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
}

.node-card:hover {
  border-color: rgba(0, 212, 170, 0.3);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.node-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.node-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--nf-text-primary);
}

/* =============== 技术栈 =============== */
/* =============== 快速开始 =============== */
.quickstart-section {
  padding: 100px 0;
}

.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 48px;
}

.step-card {
  padding: 32px 28px;
  background: rgba(22, 27, 34, 0.5);
  border: 1px solid rgba(33, 38, 45, 0.5);
  border-radius: 12px;
  text-align: center;
  transition: all 0.3s ease;
  backdrop-filter: blur(4px);
}

.step-card:hover {
  border-color: rgba(0, 212, 170, 0.3);
  transform: translateY(-4px);
}

.step-number {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #00d4aa, #00b4d8);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 auto 20px;
}

.step-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 10px;
  color: var(--nf-text-primary);
}

.step-desc {
  font-size: 14px;
  color: var(--nf-text-secondary);
  line-height: 1.7;
  margin: 0;
}

.cta-area {
  text-align: center;
}

/* =============== 技术栈滚动 =============== */
.marquee-section {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 48px 0 56px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 24px;
  mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%);
}

.marquee-track {
  width: 100%;
  overflow: hidden;
}

.marquee-content {
  display: flex;
  align-items: center;
  width: max-content;
}

.marquee-left .marquee-content {
  animation: scrollLeft 30s linear infinite;
}

.marquee-right .marquee-content {
  animation: scrollRight 34s linear infinite;
}

@keyframes scrollLeft {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes scrollRight {
  0% { transform: translateX(-50%); }
  100% { transform: translateX(0); }
}

.marquee-icon {
  width: 36px;
  height: 36px;
  margin-right: 52px;
  object-fit: contain;
  opacity: 0.55;
  filter: grayscale(0.3) brightness(1.6);
  transition: all 0.4s ease;
  flex-shrink: 0;
}

.marquee-icon:hover {
  opacity: 1;
  filter: grayscale(0) brightness(1.1);
  transform: scale(1.25);
}

/* =============== 页脚 =============== */
.landing-footer {
  position: relative;
  z-index: 1;
  border-top: 1px solid rgba(33, 38, 45, 0.4);
  padding: 48px 0;
  background: rgba(22, 27, 34, 0.4);
  backdrop-filter: blur(8px);
}

.footer-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 32px;
  text-align: center;
}

.footer-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.footer-logo-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  margin-bottom: 4px;
}

.footer-logo {
  font-size: 20px;
  font-weight: 700;
}

.footer-desc {
  font-size: 14px;
  color: var(--nf-text-secondary);
  margin: 8px 0 20px;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

.footer-links a {
  color: var(--nf-text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: color 0.2s;
}

.footer-links a:hover {
  color: #00d4aa;
}

.footer-divider {
  color: var(--nf-text-muted);
}

.footer-copyright {
  font-size: 13px;
  color: var(--nf-text-muted);
  margin: 0;
}

/* =============== 响应式 =============== */
@media (max-width: 768px) {
  .hero-brand {
    flex-direction: column;
    gap: 16px;
  }

  .hero-brand-name {
    font-size: 40px;
  }

  .hero-mascot {
    width: 100px;
    height: 100px;
  }

  .hero-title {
    font-size: 26px;
  }

  .features-grid,
  .steps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
