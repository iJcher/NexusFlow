<template>
  <div class="about-page">
    <!-- Brand hero -->
    <section class="brand-hero">
      <img src="@/assets/images/logo.png" alt="NexusFlow" class="brand-logo" />
      <h1 class="brand-title">
        <span class="brand-nexus">Nexus</span><span class="brand-flow">Flow</span>
      </h1>
      <p class="brand-tagline">{{ t('about.tagline') }}</p>
    </section>

    <!-- Core features -->
    <section class="section">
      <h2 class="section-title">{{ t('about.featuresTitle') }}</h2>
      <div class="features-grid">
        <div v-for="feature in features" :key="feature.key" class="feature-card">
          <div class="feature-icon" :class="feature.iconClass">
            <component :is="feature.icon" />
          </div>
          <h3 class="feature-name">{{ t(`home.feature_${feature.key}_title`) }}</h3>
          <p class="feature-desc">{{ t(`home.feature_${feature.key}_desc`) }}</p>
        </div>
      </div>
    </section>

    <!-- Flow demo -->
    <section class="section">
      <h2 class="section-title">{{ t('about.flowDemoTitle') }}</h2>
      <p class="section-subtitle">{{ t('about.flowDemoSubtitle') }}</p>
      <div class="flow-demo-card">
        <div class="demo-header">
          <span class="dot red"></span>
          <span class="dot yellow"></span>
          <span class="dot green"></span>
          <span class="demo-title">workflow-demo</span>
        </div>
        <div class="demo-body">
          <div class="flow-demo">
            <div class="flow-node start">
              <span class="node-icon">▶</span>
              <span>Start</span>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-node llm">
              <span class="node-icon">🤖</span>
              <span>LLM</span>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-node condition">
              <span class="node-icon">◆</span>
              <span>Condition</span>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-node reply">
              <span class="node-icon">💬</span>
              <span>Reply</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick start -->
    <section class="section">
      <h2 class="section-title">{{ t('about.quickstartTitle') }}</h2>
      <p class="section-subtitle">{{ t('about.quickstartSubtitle') }}</p>
      <div class="steps-grid">
        <div v-for="(_, idx) in 3" :key="idx" class="step-card">
          <div class="step-number">{{ idx + 1 }}</div>
          <h3 class="step-title">{{ t(`home.step${idx + 1}_title`) }}</h3>
          <p class="step-desc">{{ t(`home.step${idx + 1}_desc`) }}</p>
        </div>
      </div>
      <div class="cta-area">
        <el-button type="primary" size="large" @click="$router.push('/studio')">
          {{ t('home.startNow') }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { markRaw } from 'vue'
import { useI18n } from 'vue-i18n'
import { Monitor, MagicStick, Share, CircleCheck, Setting, Connection } from '@element-plus/icons-vue'

const { t } = useI18n()

const features = [
  { key: 'visual', icon: markRaw(Monitor), iconClass: 'icon-visual' },
  { key: 'ai', icon: markRaw(MagicStick), iconClass: 'icon-ai' },
  { key: 'logic', icon: markRaw(Share), iconClass: 'icon-logic' },
  { key: 'approval', icon: markRaw(CircleCheck), iconClass: 'icon-approval' },
  { key: 'model', icon: markRaw(Setting), iconClass: 'icon-model' },
  { key: 'realtime', icon: markRaw(Connection), iconClass: 'icon-realtime' },
]
</script>

<style scoped>
.about-page {
  max-width: 1000px;
  margin: 0 auto;
  padding: 40px 32px 60px;
}

/* ── Brand hero ── */
.brand-hero {
  text-align: center;
  margin-bottom: 56px;
}

.brand-logo {
  width: 72px;
  height: 72px;
  object-fit: contain;
  margin-bottom: 16px;
}

.brand-title {
  font-family: 'DongFangDaKai', sans-serif;
  font-size: 40px;
  font-weight: 800;
  margin: 0 0 8px;
  letter-spacing: 1px;
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

.brand-tagline {
  font-size: 16px;
  color: var(--nf-text-secondary);
  margin: 0;
}

/* ── Section ── */
.section {
  margin-bottom: 48px;
}

.section-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 8px;
  color: var(--nf-text-primary);
  text-align: center;
}

.section-subtitle {
  font-size: 14px;
  color: var(--nf-text-secondary);
  margin: 0 0 24px;
  text-align: center;
}

/* ── Features ── */
.features-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 24px;
}

.feature-card {
  padding: 24px 20px;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.feature-card:hover {
  border-color: var(--nf-accent-muted);
  transform: translateY(-2px);
  box-shadow: var(--nf-shadow-md);
}

.feature-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  font-size: 20px;
  color: #fff;
}

.icon-visual { background: linear-gradient(135deg, #2dd4bf, #06b6d4); }
.icon-ai { background: linear-gradient(135deg, #06b6d4, #0891b2); }
.icon-logic { background: linear-gradient(135deg, #14b8a6, #2dd4bf); }
.icon-approval { background: linear-gradient(135deg, #38bdf8, #0284c7); }
.icon-model { background: linear-gradient(135deg, #f59e0b, #d97706); }
.icon-realtime { background: linear-gradient(135deg, #a78bfa, #7c3aed); }

.feature-name {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--nf-text-primary);
}

.feature-desc {
  font-size: 13px;
  color: var(--nf-text-secondary);
  line-height: 1.6;
  margin: 0;
}

/* ── Flow demo ── */
.flow-demo-card {
  max-width: 560px;
  margin: 0 auto;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  overflow: hidden;
}

.demo-header {
  padding: 10px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--nf-bg-elevated);
  border-bottom: 1px solid var(--nf-border);
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot.red { background: #ff5f57; }
.dot.yellow { background: #febc2e; }
.dot.green { background: #28c840; }

.demo-title {
  font-size: 12px;
  color: var(--nf-text-muted);
  margin-left: 6px;
}

.demo-body {
  padding: 28px 20px;
}

.flow-demo {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.flow-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  background: var(--nf-bg-elevated);
  border: 1px solid var(--nf-border);
  border-radius: 8px;
  font-size: 12px;
  color: var(--nf-text-primary);
  min-width: 64px;
}

.node-icon { font-size: 16px; }

.flow-arrow {
  color: var(--nf-text-muted);
  font-size: 16px;
}

/* ── Steps ── */
.steps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.step-card {
  padding: 24px 20px;
  background: var(--nf-bg-card);
  border: 1px solid var(--nf-border);
  border-radius: 12px;
  text-align: center;
  transition: all 0.2s ease;
}

.step-card:hover {
  border-color: var(--nf-accent-muted);
  transform: translateY(-2px);
}

.step-number {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--nf-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0 auto 14px;
}

.step-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 6px;
  color: var(--nf-text-primary);
}

.step-desc {
  font-size: 13px;
  color: var(--nf-text-secondary);
  line-height: 1.6;
  margin: 0;
}

.cta-area {
  text-align: center;
}

@media (max-width: 768px) {
  .features-grid,
  .steps-grid {
    grid-template-columns: 1fr;
  }
}
</style>
