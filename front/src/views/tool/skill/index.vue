<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Delete, Refresh, Tools } from '@element-plus/icons-vue'
import { SkillService, type ISkillDto } from '@/services/skill.service'
import { McpService, type IMcpServerDto } from '@/services/mcp.service'

const activeTab = ref<'skills' | 'mcp'>('skills')
const loading = ref<boolean>(false)
const skills = ref<ISkillDto[]>([])
const mcpServers = ref<IMcpServerDto[]>([])
const selectedSkill = ref<ISkillDto | null>(null)
const previewVisible = ref<boolean>(false)

const skillCount = computed<number>(() => skills.value.length)
const mcpCount = computed<number>(() => mcpServers.value.length)

const loadData = async () => {
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

const deleteSkill = async (skill: ISkillDto) => {
  await ElMessageBox.confirm(`确认删除 Skill「${skill.name}」？`, '删除 Skill', { type: 'warning' })
  const res = await SkillService.delete(skill.id)
  if (res.errCode === 0) {
    ElMessage.success('Skill 已删除')
    await loadData()
  }
}

const openSkillPreview = (skill: ISkillDto) => {
  selectedSkill.value = skill
  previewVisible.value = true
}

const deleteMcp = async (server: IMcpServerDto) => {
  await ElMessageBox.confirm(`确认删除 MCP Server「${server.name}」？`, '删除 MCP', { type: 'warning' })
  const res = await McpService.delete(server.id)
  if (res.errCode === 0) {
    ElMessage.success('MCP Server 已删除')
    await loadData()
  }
}

onMounted(loadData)
</script>

<template>
  <div class="tool-skill-page" v-loading="loading">
    <section class="hero-card">
      <div>
        <p class="eyebrow">TOOL / SKILL CENTER</p>
        <h2>工具与 Skill 能力中心</h2>
        <p class="hero-desc">
          统一管理 MCP Provider、远程工具 Schema，以及由工作流炼化生成的 Agent Skill。
        </p>
      </div>
      <button class="refresh-btn" @click="loadData">
        <el-icon><Refresh /></el-icon>
        刷新
      </button>
    </section>

    <div class="tabs">
      <button :class="['tab-btn', { active: activeTab === 'skills' }]" @click="activeTab = 'skills'">
        <el-icon><Tools /></el-icon>
        Skills
        <span>{{ skillCount }}</span>
      </button>
      <button :class="['tab-btn', { active: activeTab === 'mcp' }]" @click="activeTab = 'mcp'">
        <el-icon><Connection /></el-icon>
        MCP Servers
        <span>{{ mcpCount }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'skills'" class="content-grid">
      <article
        v-for="skill in skills"
        :key="skill.id"
        class="data-card"
        @click="openSkillPreview(skill)"
      >
        <div class="card-head">
          <span class="pill">v{{ skill.version }}</span>
          <button class="icon-btn" @click.stop="deleteSkill(skill)">
            <el-icon><Delete /></el-icon>
          </button>
        </div>
        <h3>{{ skill.name }}</h3>
        <p>{{ skill.description || '暂无描述' }}</p>
        <div class="meta-line">
          <span>{{ skill.status }}</span>
          <span>{{ Object.keys(skill.files || {}).length }} files</span>
        </div>
      </article>
      <el-empty v-if="skills.length === 0" description="暂无 Skill，请在 Studio 工作流卡片中点击生成 Skill" />
    </section>

    <section v-else class="content-grid">
      <article v-for="server in mcpServers" :key="server.id" class="data-card">
        <div class="card-head">
          <span class="pill">{{ server.transport }}</span>
          <button class="icon-btn" @click.stop="deleteMcp(server)">
            <el-icon><Delete /></el-icon>
          </button>
        </div>
        <h3>{{ server.name }}</h3>
        <p>{{ server.endpoint || server.command || '未配置连接地址' }}</p>
        <div class="meta-line">
          <span>{{ server.status }}</span>
          <span>{{ server.tools?.length || 0 }} tools</span>
        </div>
      </article>
      <el-empty v-if="mcpServers.length === 0" description="暂无 MCP Server，后续将在这里添加配置入口" />
    </section>

    <el-drawer v-model="previewVisible" size="520px" title="Skill 文件预览">
      <div v-if="selectedSkill" class="skill-preview">
        <h3>{{ selectedSkill.name }}</h3>
        <p>{{ selectedSkill.description }}</p>
        <div v-for="(content, path) in selectedSkill.files" :key="path" class="file-block">
          <div class="file-path">{{ path }}</div>
          <pre>{{ content }}</pre>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.tool-skill-page {
  min-height: 100%;
  padding: 24px 32px;
  background:
    radial-gradient(circle, rgba(0, 255, 159, 0.03) 0.5px, transparent 0.5px),
    var(--nf-bg-base);
  background-size: 20px 20px;
  font-family: var(--nf-font-display);
}

.hero-card,
.data-card {
  border: 1px solid rgba(255,255,255,0.06);
  background: var(--nf-bg-surface-alpha);
  border-radius: 12px;
  transition: border-color .2s ease, box-shadow .2s ease;
}

.hero-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
  margin-bottom: 18px;

  &:hover {
    border-color: rgba(0,255,159,0.3);
    box-shadow: var(--nf-glow-md);
  }

  h2 {
    margin: 0;
    color: var(--nf-text-primary);
    font-size: 22px;
    font-weight: 600;
    letter-spacing: .08em;
  }
}

.eyebrow,
.meta-line,
.file-path {
  color: var(--nf-text-secondary);
  font-size: 12px;
  letter-spacing: .08em;
}

.hero-desc,
.data-card p {
  color: var(--nf-text-body);
  font-size: 14px;
  line-height: 1.75;
}

.refresh-btn,
.tab-btn,
.icon-btn {
  border: 1px solid rgba(255,255,255,0.06);
  background: transparent;
  color: var(--nf-text-body);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color .2s ease, color .2s ease, background .2s ease;

  &:hover {
    border-color: rgba(0,255,159,0.35);
    color: var(--nf-text-hover);
  }
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
}

.tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;

  &.active {
    border-color: rgba(0,255,159,0.5);
    color: var(--nf-accent);
    background: rgba(0,255,159,0.06);
  }
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.data-card {
  padding: 18px;
  cursor: pointer;

  &:hover {
    border-color: rgba(0,255,159,0.3);
    box-shadow: var(--nf-glow-sm);
  }

  h3 {
    margin: 14px 0 8px;
    color: var(--nf-text-primary);
    font-size: 16px;
    font-weight: 500;
  }
}

.card-head,
.meta-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pill {
  border: 1px solid rgba(0,255,159,0.25);
  border-radius: 999px;
  padding: 3px 10px;
  color: var(--nf-accent);
  font-size: 12px;
}

.icon-btn {
  width: 30px;
  height: 30px;
}

.skill-preview {
  color: var(--nf-text-body);

  h3 {
    color: var(--nf-text-primary);
  }
}

.file-block {
  margin-top: 16px;
}

pre {
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px;
  color: var(--nf-text-body);
  background: var(--nf-bg-base);
  font-size: 12px;
}
</style>
