<script setup lang="ts">
/**
 * Tool / Skill Center —— 列表页。
 *
 * 设计协议：nexus-dark-fui §1-§9。
 * - Page bg：micro-dot grid
 * - Hero：surface-alpha card + metric strip
 * - Tabs：active 用 inset bottom-bar + bg muted
 * - Cards：transparent bg + 0.06 border，hover 跳到 0.3 accent + glow-md
 * - Card 操作按钮：ghost / danger，分别 hover 绿边 / 红边
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Connection, Delete, Document, Download, MagicStick, Refresh, Tools,
} from '@element-plus/icons-vue'
import { SkillService, type ISkillDto } from '@/services/skill.service'
import { McpService, type IMcpServerDto } from '@/services/mcp.service'

const router = useRouter()
const activeTab = ref<'skills' | 'mcp'>('skills')
const loading = ref<boolean>(false)
const skills = ref<ISkillDto[]>([])
const mcpServers = ref<IMcpServerDto[]>([])

const skillCount = computed<number>(() => skills.value.length)
const mcpCount = computed<number>(() => mcpServers.value.length)
const totalFiles = computed<number>(() =>
  skills.value.reduce((sum, s) => sum + Object.keys(s.files || {}).length, 0),
)
const usedModels = computed<number>(() => {
  const set = new Set<string>()
  for (const s of skills.value) {
    if (s.modelName) set.add(s.modelName)
  }
  return set.size
})

const loadData = async (): Promise<void> => {
  loading.value = true
  try {
    const [skillRes, mcpRes] = await Promise.all([
      SkillService.getList(),
      McpService.getList(),
    ])
    if (skillRes.errCode === 0 && skillRes.data) skills.value = skillRes.data
    if (mcpRes.errCode === 0 && mcpRes.data) mcpServers.value = mcpRes.data
  }
  catch (error) {
    console.error('Failed to load tool center:', error)
    ElMessage.error('加载工具中心失败')
  }
  finally {
    loading.value = false
  }
}

const openSkillDetail = (skill: ISkillDto): void => {
  router.push(`/tool/skill/${skill.id}`)
}

const downloadSkill = async (skill: ISkillDto): Promise<void> => {
  try {
    await SkillService.downloadAsZip(skill)
    ElMessage.success('下载已开始')
  }
  catch (error) {
    console.error('Download skill failed:', error)
    ElMessage.error('打包下载失败')
  }
}

const deleteSkill = async (skill: ISkillDto): Promise<void> => {
  await ElMessageBox.confirm(
    `确认删除 Skill「${skill.name}」？`,
    '删除 Skill',
    { type: 'warning' },
  )
  const res = await SkillService.delete(skill.id)
  if (res.errCode === 0) {
    ElMessage.success('Skill 已删除')
    await loadData()
  }
}

const deleteMcp = async (server: IMcpServerDto): Promise<void> => {
  await ElMessageBox.confirm(
    `确认删除 MCP Server「${server.name}」？`,
    '删除 MCP',
    { type: 'warning' },
  )
  const res = await McpService.delete(server.id)
  if (res.errCode === 0) {
    ElMessage.success('MCP Server 已删除')
    await loadData()
  }
}

const goToStudio = (): void => {
  router.push('/studio')
}

const formatTime = (iso?: string | null): string => {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div v-loading="loading" class="tool-skill-page">
    <!-- ═════════ Hero ═════════ -->
    <section class="hero">
      <div class="hero-text">
        <p class="hero-eyebrow">TOOL / SKILL CENTER</p>
        <h1 class="hero-title">工具与 Skill 能力中心</h1>
        <p class="hero-desc">
          统一管理 MCP Provider、远程工具 Schema，以及由工作流炼化生成的 Agent Skill。
        </p>
      </div>
      <div class="hero-side">
        <div class="hero-metrics">
          <div class="metric">
            <span class="metric__label">SKILLS</span>
            <span class="metric__value">{{ skillCount }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">FILES</span>
            <span class="metric__value">{{ totalFiles }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">MODELS</span>
            <span class="metric__value">{{ usedModels }}</span>
          </div>
          <div class="metric">
            <span class="metric__label">MCP</span>
            <span class="metric__value">{{ mcpCount }}</span>
          </div>
        </div>
        <button class="fui-btn fui-btn--ghost" @click="loadData">
          <el-icon :size="14"><Refresh /></el-icon>
          刷新
        </button>
      </div>
    </section>

    <!-- ═════════ Tabs ═════════ -->
    <nav class="tabs">
      <button :class="['tab-btn', { active: activeTab === 'skills' }]" @click="activeTab = 'skills'">
        <el-icon :size="14"><Tools /></el-icon>
        <span>SKILLS</span>
        <span class="tab-count">{{ skillCount }}</span>
      </button>
      <button :class="['tab-btn', { active: activeTab === 'mcp' }]" @click="activeTab = 'mcp'">
        <el-icon :size="14"><Connection /></el-icon>
        <span>MCP SERVERS</span>
        <span class="tab-count">{{ mcpCount }}</span>
      </button>
    </nav>

    <!-- ═════════ Content ═════════ -->
    <section v-if="activeTab === 'skills'" class="content-area">
      <div v-if="skills.length > 0" class="card-grid">
        <article
          v-for="skill in skills"
          :key="skill.id"
          class="skill-card"
          @click="openSkillDetail(skill)"
        >
          <div class="skill-card__top">
            <div class="skill-card__tags">
              <span class="fui-tag fui-tag--accent">v{{ skill.version }}</span>
              <span v-if="skill.modelName" class="fui-tag fui-tag--neutral">
                {{ skill.modelName }}
              </span>
            </div>
            <div class="skill-card__actions">
              <button
                class="icon-btn"
                title="下载 ZIP"
                @click.stop="downloadSkill(skill)"
              >
                <el-icon :size="14"><Download /></el-icon>
              </button>
              <button
                class="icon-btn icon-btn--danger"
                title="删除"
                @click.stop="deleteSkill(skill)"
              >
                <el-icon :size="14"><Delete /></el-icon>
              </button>
            </div>
          </div>

          <h3 class="skill-card__name">{{ skill.name }}</h3>
          <p class="skill-card__desc">{{ skill.description || '暂无描述' }}</p>

          <div class="skill-card__footer">
            <span class="footer-stat">
              <el-icon :size="12"><Document /></el-icon>
              {{ Object.keys(skill.files || {}).length }} files
            </span>
            <span class="footer-time">{{ formatTime(skill.updatedAt) }}</span>
          </div>
        </article>
      </div>

      <div v-else class="empty-panel">
        <div class="empty-icon-ring">
          <el-icon :size="22"><MagicStick /></el-icon>
        </div>
        <p class="empty-title">No Skills Yet</p>
        <p class="empty-desc">
          在 Studio 工作流卡片中点击「生成 Skill」即可炼化出一个可复用的 Agent Skill。
        </p>
        <button class="fui-btn fui-btn--primary" @click="goToStudio">
          前往 Studio
        </button>
      </div>
    </section>

    <section v-else class="content-area">
      <div v-if="mcpServers.length > 0" class="card-grid">
        <article v-for="server in mcpServers" :key="server.id" class="skill-card">
          <div class="skill-card__top">
            <div class="skill-card__tags">
              <span class="fui-tag fui-tag--accent">{{ server.transport }}</span>
            </div>
            <div class="skill-card__actions">
              <button
                class="icon-btn icon-btn--danger"
                title="删除"
                @click.stop="deleteMcp(server)"
              >
                <el-icon :size="14"><Delete /></el-icon>
              </button>
            </div>
          </div>
          <h3 class="skill-card__name">{{ server.name }}</h3>
          <p class="skill-card__desc">{{ server.endpoint || server.command || '未配置连接地址' }}</p>
          <div class="skill-card__footer">
            <span class="footer-stat">{{ server.status }}</span>
            <span class="footer-time">{{ server.tools?.length || 0 }} tools</span>
          </div>
        </article>
      </div>

      <div v-else class="empty-panel">
        <div class="empty-icon-ring">
          <el-icon :size="22"><Connection /></el-icon>
        </div>
        <p class="empty-title">No MCP Server</p>
        <p class="empty-desc">
          后续将在这里提供 MCP Server 连接配置入口，可接入任意符合 MCP 协议的远程工具。
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
/* ─────────────────────────────────────────────
 * §5 Page bg
 * ───────────────────────────────────────────── */
.tool-skill-page {
  min-height: 100%;
  padding: 28px 32px;
  background:
    radial-gradient(circle, var(--nf-grid-color) 0.5px, transparent 0.5px),
    var(--nf-bg-base);
  background-size: var(--nf-grid-size) var(--nf-grid-size);
  font-family: var(--nf-font-display);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─────────────────────────────────────────────
 * Hero
 * ───────────────────────────────────────────── */
.hero {
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 32px;
  padding: 24px 28px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
  flex-wrap: wrap;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

/* §3 Label：12px 600 0.12em */
.hero-eyebrow {
  margin: 0;
  color: var(--nf-text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.16em;
  line-height: 1.3;
}

/* §3 H1：22px 600 0.08em */
.hero-title {
  margin: 0;
  color: var(--nf-text-primary);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
  line-height: 1.4;
}

/* §3 Body：14px / lh 1.75 / secondary */
.hero-desc {
  margin: 0;
  color: var(--nf-text-secondary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.75;
  letter-spacing: 0.02em;
  max-width: 640px;
}

.hero-side {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
}

.hero-metrics {
  display: flex;
  gap: 4px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 16px;
  min-width: 64px;

  & + & {
    border-left: 1px solid rgba(255, 255, 255, 0.06);
  }

  &__label {
    color: var(--nf-text-muted);
    font-family: var(--nf-font-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
  }

  &__value {
    color: var(--nf-accent);
    font-family: var(--nf-font-mono);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: 0.02em;
    line-height: 1;
  }
}

/* ─────────────────────────────────────────────
 * §5 Buttons
 * ───────────────────────────────────────────── */
.fui-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 6px;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.fui-btn--ghost {
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--nf-text-secondary);

  &:hover {
    border-color: rgba(0, 255, 159, 0.35);
    color: #B0BEC5;
  }
}

.fui-btn--primary {
  border: 1px solid var(--nf-accent);
  color: var(--nf-accent);
  box-shadow: var(--nf-glow-sm);

  &:hover {
    border-color: var(--nf-accent-hover);
    color: var(--nf-accent-hover);
    background: rgba(0, 255, 159, 0.06);
    box-shadow: var(--nf-glow-md);
  }
}

/* ─────────────────────────────────────────────
 * §5 Tabs：active inset bottom-bar
 * ───────────────────────────────────────────── */
.tabs {
  display: flex;
  gap: 4px;
  padding: 0 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: var(--nf-text-secondary);
  font-family: var(--nf-font-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
  cursor: pointer;
  position: relative;
  bottom: -1px;
  transition: color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    color: #B0BEC5;
    box-shadow: inset 0 -2px 0 rgba(255, 255, 255, 0.08);
  }

  &.active {
    color: var(--nf-accent);
    background: rgba(0, 255, 159, 0.04);
    box-shadow: inset 0 -2px 0 var(--nf-accent);
  }

  .tab-count {
    padding: 1px 8px;
    border: 1px solid currentColor;
    border-radius: 9999px;
    color: inherit;
    font-family: var(--nf-font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.02em;
    opacity: 0.7;
  }
}

/* ─────────────────────────────────────────────
 * Content area
 * ───────────────────────────────────────────── */
.content-area {
  flex: 1;
  min-height: 0;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

/* ─────────────────────────────────────────────
 * §5 Card：transparent bg → 0.06 border → hover 0.3 accent + glow-md
 * ───────────────────────────────────────────── */
.skill-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;

  &:hover {
    border-color: rgba(0, 255, 159, 0.3);
    box-shadow: var(--nf-glow-md);
  }

  &__top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  &__tags {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  &__actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  /* §3 H2：16-18px / 600 / 0.06em / primary */
  &__name {
    margin: 4px 0 0;
    color: var(--nf-text-primary);
    font-size: 16px;
    font-weight: 600;
    letter-spacing: 0.06em;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* §3 Body：14px / 0.02em / secondary / lh 1.75 */
  &__desc {
    margin: 0;
    color: var(--nf-text-secondary);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.75;
    letter-spacing: 0.02em;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  &__footer {
    margin-top: auto;
    padding-top: 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-top: 1px solid rgba(255, 255, 255, 0.04);
    color: var(--nf-text-muted);
    font-family: var(--nf-font-mono);
    font-size: 11.5px;
    letter-spacing: 0.04em;
  }
}

.footer-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.footer-time {
  color: var(--nf-text-muted);
}

/* ─────────────────────────────────────────────
 * §5 Tag
 * ───────────────────────────────────────────── */
.fui-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 9999px;
  background: transparent;
  font-family: var(--nf-font-display);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  transition: border-color 0.2s ease, color 0.2s ease;
}

.fui-tag--accent {
  border: 1px solid rgba(0, 255, 159, 0.25);
  color: var(--nf-accent);

  &:hover {
    border-color: rgba(0, 255, 159, 0.45);
  }
}

.fui-tag--neutral {
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--nf-text-secondary);
  text-transform: none;
  letter-spacing: 0.04em;
  font-family: var(--nf-font-mono);
  font-weight: 500;

  &:hover {
    border-color: rgba(255, 255, 255, 0.18);
    color: #B0BEC5;
  }
}

/* ─────────────────────────────────────────────
 * Icon button（卡片右上小按钮）
 * ───────────────────────────────────────────── */
.icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: transparent;
  color: var(--nf-text-secondary);
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;

  &:hover {
    border-color: rgba(0, 255, 159, 0.35);
    color: var(--nf-accent);
  }

  &--danger:hover {
    border-color: var(--nf-danger);
    color: var(--nf-danger);
    background: rgba(248, 113, 113, 0.06);
  }
}

/* ─────────────────────────────────────────────
 * Empty panel
 * ───────────────────────────────────────────── */
.empty-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 64px 32px;
  border: 1px dashed rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  background: var(--nf-bg-card-alpha);
}

.empty-icon-ring {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: 1px solid rgba(0, 255, 159, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nf-accent);
  background: var(--nf-accent-muted);
  box-shadow: var(--nf-glow-sm);
}

.empty-title {
  margin: 0;
  color: var(--nf-text-primary);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.empty-desc {
  margin: 0;
  max-width: 460px;
  text-align: center;
  color: var(--nf-text-secondary);
  font-size: 13px;
  line-height: 1.75;
  letter-spacing: 0.02em;
}

/* ─────────────────────────────────────────────
 * §5 Scrollbar
 * ───────────────────────────────────────────── */
::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.14);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
