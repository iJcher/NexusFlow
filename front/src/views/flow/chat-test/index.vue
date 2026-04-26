<template>
  <div :class="containerClass">
    <aside :class="['chat-sidebar', { 'is-open': sidebarOpen || !isCompactLayout, 'is-collapsed': !sidebarOpen && !isCompactLayout }]">
      <div class="sidebar-header">
        <div class="top-btn-row">
          <el-button :icon="Plus" text class="nf-top-btn" @click="startNewConversation">{{ t('flowChat.newConversation') || '新建会话' }}</el-button>
          <el-button :icon="Refresh" text class="nf-top-btn" :loading="isConversationsLoading" @click="loadConversations(true)">{{ t('flowChat.refresh') || '刷新' }}</el-button>
        </div>
        <button class="sidebar-toggle-btn" type="button" @click="sidebarOpen = !sidebarOpen">
          <el-icon :size="16"><Fold /></el-icon>
        </button>
      </div>

      <el-scrollbar class="sidebar-scroll">
        <div
          v-for="(conv, index) in sortedConversations"
          :key="conv.id || conv.title || index"
          :class="['conv-item', { active: conv.id === conversationId }]"
          @click="handleSelectConversation(conv)"
        >
          <span class="conv-title truncate">{{ conv.title || t('flowChat.untitledConversation') || '未命名会话' }}</span>
          <el-dropdown
            trigger="click"
            placement="bottom-end"
            @click.stop
            @command="(command: string) => handleConversationCommand(command, conv)"
          >
            <button class="conv-more" @click.stop>
              <el-icon :size="16"><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="pin">{{ conv.isTop ? t('flowChat.unpin') : t('flowChat.pin') }}</el-dropdown-item>
                <el-dropdown-item command="rename">{{ t('flowChat.rename') }}</el-dropdown-item>
                <el-dropdown-item command="delete" class="danger-dropdown-item">{{ t('flowChat.delete') }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div v-if="!sortedConversations.length && !isConversationsLoading" class="text-center text-nf-text-secondary py-6">
          {{ t('flowChat.noConversations') || '暂无会话，点击新建开始聊天' }}
        </div>
        <div v-if="hasMoreConversations" class="text-center py-2 pb-4">
          <el-button text :loading="isConversationsLoading" @click="loadConversations(false)">
            {{ t('flowChat.loadMore') || '加载更多' }}
          </el-button>
        </div>
      </el-scrollbar>
    </aside>
    <div v-if="isCompactLayout && sidebarOpen" class="sidebar-mask" @click="sidebarOpen = false"></div>

    <section class="chat-main">
      <button
        v-if="!sidebarOpen"
        class="sidebar-expand-btn"
        type="button"
        @click="sidebarOpen = true"
      >
        <el-icon :size="16"><Expand /></el-icon>
      </button>
      <div class="chat-scroll-region">
        <!-- 聊天内容区域 -->
        <div class="chat-content" ref="chatContentRef" @scroll="updateMeteorScrollbar">
          <div v-if="messagesHasMore" class="flex justify-center mb-2">
            <el-button size="small" text :loading="isMessagesLoading" @click="loadMessages(false)">
              {{ t('flowChat.loadMoreMessages') || '加载更多历史消息' }}
            </el-button>
          </div>

          <!-- 欢迎消息 -->
          <div v-if="messages.length === 0" class="welcome-panel text-center py-15 px-5 text-nf-text-secondary">
            <img :src="botImage" alt="" class="welcome-bot" />
            <h2 class="welcome-title">{{ t('flowChat.welcome') }}</h2>
            <p class="text-3.5 text-nf-text-secondary">{{ t('flowChat.welcomeDesc') }}</p>
          </div>

          <!-- 消息列表 -->
          <div v-for="(msg, index) in messages" :key="`msg-${index}-${msg.timestamp}`" class="message-row">
            <!-- 用户消息 -->
            <div v-if="msg.role === 'user'" class="message user-message">
              <div class="user-bubble">
                <div class="message-text">{{ msg.content }}</div>
                <div v-if="msg.files && msg.files.length > 0" class="mt-2 flex flex-col gap-1">
                  <div v-for="(file, idx) in msg.files" :key="idx" class="flex items-center gap-1.5 text-3 opacity-90">
                    <el-icon :size="14"><Paperclip /></el-icon>
                    <a :href="file.url" target="_blank" class="text-inherit underline truncate max-w-75 hover:opacity-80">
                      {{ file.name || file.url }}
                    </a>
                  </div>
                </div>
              </div>
              <div class="nf-avatar user-avatar-bg">
                <img :src="defaultAvatarImage" alt="" class="user-avatar-img" />
              </div>
            </div>

            <!-- AI消息 -->
            <div v-else class="message ai-message">
              <div class="nf-avatar ai-avatar-bg">
                <img :src="botImage" alt="" class="ai-avatar-img" />
              </div>
              <div class="ai-bubble">
                <div class="message-text" v-html="formatMarkdown(msg.content)"></div>
                <div v-if="isLoading && index === messages.length - 1" class="inline-streaming-indicator">
                  <span v-if="!msg.content.trim()" class="streaming-text">{{ t('flowChat.generating') || '正在生成' }}</span>
                  <span class="streaming-dot"></span>
                  <span class="streaming-dot"></span>
                  <span class="streaming-dot"></span>
                </div>
                
                <div v-if="msg.flowInstanceId" class="mt-2 flex gap-2">
                  <a 
                    :href="`/flow/logs/${flowId}/${msg.flowInstanceId}`" 
                    target="_blank"
                    class="log-link"
                  >
                    {{ t('flowChat.viewRunLog') }}
                  </a>
                </div>
                
                <div class="text-3 text-nf-text-secondary mt-1">{{ formatTime(msg.timestamp) }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-show="isMeteorScrollbarVisible" class="meteor-scrollbar">
          <div class="meteor-scrollbar__thumb" :style="meteorThumbStyle"></div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="composer-wrap">
        <!-- 文件列表 -->
        <div v-if="files.length > 0" class="flex flex-wrap gap-2 mb-3">
          <div v-for="(file, index) in files" :key="index" class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-nf-elevated border border-nf-border-light rounded-2 text-3.25 text-nf-text-secondary transition-all hover:bg-nf-border-light">
            <el-icon :size="14"><Paperclip /></el-icon>
            <span class="max-w-50 truncate">{{ file.name || file.url }}</span>
            <el-icon 
              :size="14" 
              class="cursor-pointer text-nf-text-secondary transition-colors hover:text-red-500" 
              @click="removeFile(index)"
            >
              <CloseBold />
            </el-icon>
          </div>
        </div>
        
        <div class="composer-input">
          <el-input
            ref="inputRef"
            v-model="inputMessage"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 12 }"
            :placeholder="t('flowChat.inputPlaceholder')"
            :disabled="isLoading"
            @keydown.enter.exact.prevent="sendMessage"
            class="composer-textarea"
          />
        </div>
        <div class="composer-footer">
          <div class="composer-tools">
            <input
              ref="fileInputRef"
              class="file-input"
              type="file"
              multiple
              @change="handleNativeFileChange"
            />
            <button class="tool-chip" type="button" :disabled="isLoading" @click="openFileDialog">
              <el-icon :size="15"><Paperclip /></el-icon>
              <span>{{ t('flowChat.addFile') }}</span>
            </button>
          </div>
          <div class="composer-actions">
            <el-button
              type="primary"
              :icon="Promotion"
              :loading="isLoading"
              :disabled="isLoading || !inputMessage.trim()"
              @click="sendMessage"
              class="send-btn"
              circle
            />
          </div>
        </div>
        
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Promotion, Paperclip, Plus, CloseBold, Refresh, MoreFilled, Fold, Expand } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, FileItem } from '@/composables/useChatSSE'
import { useChatSSE } from '@/composables/useChatSSE'
import { useConversationList } from '@/composables/useConversationList'
import { useMarkdownRenderer } from '@/composables/useMarkdownRenderer'
import botImage from '@/assets/images/bot.png'
import defaultAvatarImage from '@/assets/images/default.png'

const { t } = useI18n()
const route = useRoute()
interface IFlowChatTestProps {
  flowId?: string | number
  embedded?: boolean
}

const props = withDefaults(defineProps<IFlowChatTestProps>(), {
  flowId: '',
  embedded: false,
})

const flowId = computed(() => {
  if (props.flowId !== '') {
    return String(props.flowId)
  }
  return String(route.params.flowId ?? '')
})

const containerClass = computed(() => ([
  'chat-shell',
  'chat-bg',
  props.embedded ? 'w-full h-full' : 'w-screen h-screen',
]))
const sidebarOpen = ref(true)
const viewportWidth = ref<number>(window.innerWidth)
const isCompactLayout = computed<boolean>(() => viewportWidth.value <= 1100)

const messages = ref<ChatMessage[]>([])
const inputMessage = ref('')
const conversationId = ref('')
const chatContentRef = ref<HTMLElement | null>(null)
const inputRef = ref<{ focus: () => void } | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const meteorThumbStyle = ref<Record<string, string>>({
  height: '0px',
  transform: 'translateY(0px)',
})
const isMeteorScrollbarVisible = ref(false)

const files = ref<FileItem[]>([])

const updateMeteorScrollbar = () => {
  const el = chatContentRef.value
  if (!el) return

  const { clientHeight, scrollHeight, scrollTop } = el
  const isScrollable = scrollHeight > clientHeight + 1
  isMeteorScrollbarVisible.value = isScrollable
  if (!isScrollable) return

  const thumbHeight = Math.max(42, Math.min(clientHeight * 0.36, (clientHeight / scrollHeight) * clientHeight))
  const maxScrollTop = scrollHeight - clientHeight
  const maxThumbTop = clientHeight - thumbHeight
  const thumbTop = maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTop : 0

  meteorThumbStyle.value = {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  }
}

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContentRef.value) {
      chatContentRef.value.scrollTop = chatContentRef.value.scrollHeight
      updateMeteorScrollbar()
    }
  })
}

const convList = useConversationList(flowId, conversationId, messages)
const sse = useChatSSE(flowId, conversationId, messages, scrollToBottom, () => convList.loadConversations(true))
const { formatMarkdown } = useMarkdownRenderer()

const { isLoading, sendMessage: sseSend } = sse
const {
  sortedConversations,
  isConversationsLoading,
  hasMoreConversations,
  isMessagesLoading,
  messagesHasMore,
  loadMessages,
  loadConversations,
  selectConversation,
  startNewConversation,
  toggleConversationTop,
  renameConversation,
  deleteConversation,
} = convList

const sendMessage = () => sseSend(inputMessage, files, inputRef)
type IConversationItem = Parameters<typeof selectConversation>[0]

const handleSelectConversation = async (conversation: IConversationItem) => {
  await selectConversation(conversation)
  if (isCompactLayout.value) {
    sidebarOpen.value = false
  }
}

const handleConversationCommand = (command: string, conversation: IConversationItem) => {
  if (command === 'pin') {
    toggleConversationTop(conversation)
    return
  }
  if (command === 'rename') {
    renameConversation(conversation)
    return
  }
  if (command === 'delete') {
    deleteConversation(conversation)
  }
}

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const handleNativeFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  const selectedFiles = Array.from(target.files ?? [])
  if (!selectedFiles.length) return

  files.value.push(...selectedFiles.map((file: File) => ({
    url: URL.createObjectURL(file),
    name: file.name,
    size: file.size,
    mimeType: file.type || undefined,
  })))
  target.value = ''
  ElMessage.success(t('flowChat.fileAdded'))
}

const removeFile = (index: number) => {
  files.value.splice(index, 1)
  ElMessage.success(t('flowChat.fileDeleted'))
}

const openFileDialog = () => fileInputRef.value?.click()

const handleResize = () => {
  viewportWidth.value = window.innerWidth
  if (!isCompactLayout.value) {
    sidebarOpen.value = true
  }
  nextTick(updateMeteorScrollbar)
}

onMounted(async () => {
  window.addEventListener('resize', handleResize)
  handleResize()
  scrollToBottom()
  nextTick(() => inputRef.value?.focus())
  await loadConversations(true)
  updateMeteorScrollbar()
})

watch(messages, () => nextTick(updateMeteorScrollbar), { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<style scoped>
.chat-shell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  position: relative;
  background: var(--nf-bg-base, #020406);
}

.chat-bg {
  background: var(--nf-bg-base, #020406);
  color: var(--nf-text-body, #8B9DB0);
}

.chat-sidebar {
  width: 288px;
  min-width: 240px;
  max-width: 320px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: var(--nf-bg-base, #020406);
  display: flex;
  flex-direction: column;
  padding: 12px;
  gap: 10px;
  z-index: 12;
  transition: transform 0.2s ease;
}

.chat-sidebar.is-collapsed {
  width: 0;
  min-width: 0;
  padding: 0;
  border-right: none;
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.sidebar-title-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #E6EDF3;
  font-weight: 500;
}

.top-btn-row {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
}

.top-btn-row :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.sidebar-scroll {
  flex: 1;
}

.sidebar-mask {
  display: none;
}

.chat-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background: var(--nf-bg-base, #020406);
}

.nf-top-btn {
  width: 100%;
  justify-content: flex-start !important;
  border: 1px solid transparent !important;
  color: var(--nf-text-primary, #E6EDF3) !important;
  background: transparent !important;
  border-radius: 999px;
  padding: 5px 8px !important;
  font-size: 12px;
  font-weight: 400;
  transition: border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.nf-top-btn:hover {
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--nf-text-hover, #B0BEC5) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  box-shadow: none;
}

.nf-top-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 255, 159, 0.08);
}

.nf-top-btn :deep(.el-icon) {
  color: inherit;
}

.sidebar-toggle-btn,
.sidebar-expand-btn {
  width: 32px;
  height: 32px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 999px;
  background: transparent;
  color: var(--nf-text-body, #8B9DB0);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
}

.sidebar-toggle-btn:hover,
.sidebar-expand-btn:hover {
  border-color: rgba(255, 255, 255, 0.14);
  color: var(--nf-text-primary, #E6EDF3);
  background: rgba(255, 255, 255, 0.04);
}

.sidebar-expand-btn {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 8;
}

.conv-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0 6px 0 12px;
  margin-bottom: 2px;
  cursor: pointer;
  color: var(--nf-text-body, #8B9DB0);
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.conv-item:hover {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.04);
  color: var(--nf-text-hover, #B0BEC5);
}

.conv-item.active {
  border-color: transparent;
  background: rgba(0, 255, 159, 0.12);
  color: var(--nf-accent, #00FF9F);
  box-shadow: none;
}

.conv-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 400;
}

.conv-more {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
}

.conv-item:hover .conv-more,
.conv-item.active .conv-more {
  opacity: 1;
}

.conv-more:hover {
  border-color: rgba(0, 255, 159, 0.35);
  background: rgba(0, 255, 159, 0.06);
}

:deep(.danger-dropdown-item) {
  color: var(--nf-danger, #f87171);
}

.chat-content {
  flex: 1;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow-y: auto;
  background: transparent;
  margin: 0;
  border-radius: 0;
  border: none;
  display: flex;
  flex-direction: column;
  gap: 0;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.chat-scroll-region {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.chat-content::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.meteor-scrollbar {
  position: absolute;
  top: 0;
  right: 9px;
  bottom: 0;
  width: 3px;
  pointer-events: none;
  z-index: 5;
}

.meteor-scrollbar__thumb {
  width: 3px;
  border-radius: 999px;
  background:
    linear-gradient(180deg, transparent 0%, rgba(0, 255, 159, 0.08) 18%, rgba(0, 255, 159, 0.34) 50%, rgba(0, 255, 159, 0.08) 82%, transparent 100%);
  filter: drop-shadow(0 0 3px rgba(0, 255, 159, 0.16));
  opacity: 0.72;
  transition: opacity 0.18s ease;
  -webkit-mask-image: linear-gradient(180deg, transparent 0%, #000 24%, #000 76%, transparent 100%);
  mask-image: linear-gradient(180deg, transparent 0%, #000 24%, #000 76%, transparent 100%);
}

.welcome-panel {
  width: min(calc(100% - 40px), 840px);
  margin: auto;
  border-radius: 24px;
  background:
    radial-gradient(circle at 50% 0%, rgba(0, 255, 159, 0.06), transparent 46%),
    rgba(8, 11, 16, 0.48);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.welcome-bot {
  width: 104px;
  height: 104px;
  object-fit: contain;
  display: block;
  margin: 0 auto 14px;
  filter: drop-shadow(0 0 16px rgba(0, 255, 159, 0.16));
}

.welcome-title {
  margin: 0 0 10px;
  color: var(--nf-text-primary, #E6EDF3);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0.03em;
}

.welcome-panel p {
  font-size: 13px;
  line-height: 1.65;
}

.composer-wrap {
  width: min(calc(100% - 40px), 860px);
  margin: 0 auto 14px;
  padding: 10px 12px 12px;
  background: rgba(14, 18, 26, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(14px);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.composer-wrap:focus-within {
  border-color: rgba(0, 255, 159, 0.35);
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.36), 0 0 0 3px rgba(0, 255, 159, 0.05);
}

.composer-input {
  width: 100%;
}

.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0 0;
}

.composer-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-input {
  display: none;
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  flex-shrink: 0;
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  animation: messageSlideIn 0.25s ease-out;
}

.message-row {
  width: min(calc(100% - 40px), 860px);
  margin: 0 auto 30px;
}

@keyframes messageSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-message { justify-content: flex-end; }

.user-bubble {
  background: rgba(22, 28, 38, 0.92);
  color: var(--nf-text-primary, #E6EDF3);
  border-radius: 22px 22px 6px 22px;
  padding: 10px 16px;
  max-width: min(72%, 620px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18);
}

.user-avatar-bg {
  background: transparent;
  border: none;
  box-shadow: none;
}

.user-avatar-img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  display: block;
}

.ai-avatar-bg {
  background: transparent;
  border: none;
  box-shadow: none;
}

.ai-avatar-img {
  width: 38px;
  height: 38px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 0 10px rgba(0, 255, 159, 0.12));
}

.ai-message { justify-content: flex-start; }

.ai-bubble {
  width: 100%;
  max-width: calc(100% - 52px);
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 2px 0 0;
}

.message-text {
  font-family: var(--nf-font-display);
  font-size: 13px;
  line-height: 1.72;
  letter-spacing: 0.02em;
  word-wrap: break-word;
  white-space: normal;
  color: var(--nf-text-body, #8B9DB0);
}

.message-text :deep(*) {
  box-sizing: border-box;
}

.message-text :deep(p) {
  margin: 0 0 12px;
  padding: 0;
}

.message-text :deep(p:last-child),
.message-text :deep(ul:last-child),
.message-text :deep(ol:last-child),
.message-text :deep(blockquote:last-child),
.message-text :deep(pre:last-child) {
  margin-bottom: 0;
}

.message-text :deep(h1),
.message-text :deep(h2),
.message-text :deep(h3),
.message-text :deep(h4) {
  margin: 16px 0 8px;
  color: var(--nf-text-primary, #E6EDF3);
  font-weight: 600;
  line-height: 1.45;
  letter-spacing: 0.04em;
}

.message-text :deep(h1:first-child),
.message-text :deep(h2:first-child),
.message-text :deep(h3:first-child),
.message-text :deep(h4:first-child) {
  margin-top: 0;
}

.message-text :deep(h1) { font-size: 16px; }
.message-text :deep(h2) { font-size: 15px; }
.message-text :deep(h3),
.message-text :deep(h4) { font-size: 14px; }

.message-text :deep(strong) {
  color: var(--nf-text-primary, #E6EDF3);
  font-weight: 600;
}

.message-text :deep(ul),
.message-text :deep(ol) {
  margin: 8px 0 14px;
  padding-left: 1.35em;
}

.message-text :deep(li) {
  margin: 6px 0;
  padding-left: 2px;
}

.message-text :deep(li::marker) {
  color: var(--nf-accent, #00FF9F);
  font-weight: 600;
}

.message-text :deep(li > p) {
  margin: 4px 0;
}

.message-text :deep(a) {
  color: var(--nf-accent, #00FF9F);
  text-decoration: none;
  border-bottom: 1px solid rgba(0, 255, 159, 0.35);
  transition: color 0.2s ease, border-color 0.2s ease;
}

.message-text :deep(a:hover) {
  color: var(--nf-accent-hover, #33FFB3);
  border-bottom-color: rgba(0, 255, 159, 0.6);
}

.message-text :deep(blockquote) {
  margin: 12px 0;
  padding: 8px 12px;
  border-left: 3px solid rgba(0, 255, 159, 0.45);
  border-radius: 6px;
  background: rgba(0, 255, 159, 0.04);
  color: var(--nf-text-body, #8B9DB0);
}

.message-text :deep(pre) {
  background: rgba(2, 4, 6, 0.82);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 12px 0;
  white-space: pre;
}

.message-text :deep(code) {
  background: rgba(0, 255, 159, 0.06);
  border: 1px solid rgba(0, 255, 159, 0.16);
  color: var(--nf-text-primary, #E6EDF3);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: var(--nf-font-mono);
  font-size: 12px;
}

.message-text :deep(pre code) {
  display: block;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--nf-text-body, #8B9DB0);
  font-size: 12px;
  line-height: 1.65;
}

.message-text :deep(table) {
  width: 100%;
  margin: 12px 0;
  border-collapse: collapse;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.message-text :deep(th),
.message-text :deep(td) {
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  text-align: left;
}

.message-text :deep(th) {
  color: var(--nf-text-primary, #E6EDF3);
  background: rgba(255, 255, 255, 0.03);
  font-weight: 600;
}

.message-text :deep(tr:last-child td) {
  border-bottom: none;
}

.message-text :deep(.thinking-block) {
  margin: 12px 0;
  border-radius: 10px;
  background: var(--nf-bg-muted);
  border: 1px solid var(--nf-info-muted);
  overflow: hidden;
  transition: all 0.15s ease;
}

.message-text :deep(.thinking-block):hover {
  border-color: var(--nf-accent2);
}

.message-text :deep(.thinking-header) {
  padding: 10px 14px;
  background: var(--nf-info-muted);
  border-bottom: 1px solid var(--nf-info-muted);
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-text :deep(.thinking-icon) { font-size: 18px; line-height: 1; }

.message-text :deep(.thinking-title) {
  font-size: 12px;
  font-weight: 600;
  color: var(--nf-accent2);
  letter-spacing: 0.3px;
  flex: 1;
}

.message-text :deep(.thinking-indicator) {
  font-size: 12px;
  color: var(--nf-accent2);
  animation: thinkingPulse 1.5s ease-in-out infinite;
}

@keyframes thinkingPulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.message-text :deep(.thinking-content) {
  padding: 14px;
  color: var(--nf-text-secondary);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: var(--nf-font-mono);
}

.message-text :deep(.thinking-streaming) {
  animation: thinkingGlow 2s ease-in-out infinite;
}

@keyframes thinkingGlow {
  0%, 100% { border-color: var(--nf-info-muted); }
  50% { border-color: var(--nf-accent2); }
}

.log-link {
  font-size: 12px;
  color: var(--nf-accent);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
  font-weight: 500;
}

.log-link:hover { color: var(--nf-accent-hover); text-decoration: underline; }
.log-link::before { content: '📋'; font-size: 14px; }

.inline-streaming-indicator {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 8px;
  color: var(--nf-text-secondary, #6B7D8E);
  font-size: 12px;
  line-height: 1.5;
}

.message-text:not(:empty) + .inline-streaming-indicator {
  margin-left: 2px;
}

.streaming-text {
  color: var(--nf-text-secondary, #6B7D8E);
}

.streaming-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--nf-accent, #00FF9F);
  opacity: 0.45;
  animation: typing 1.2s infinite ease-in-out;
}

.streaming-dot:nth-last-child(2) { animation-delay: 0.16s; }
.streaming-dot:nth-last-child(1) { animation-delay: 0.32s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-8px); opacity: 1; }
}

.tool-chip {
  height: 34px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: var(--nf-text-body, #8B9DB0);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.tool-chip:disabled {
  color: var(--nf-text-disabled, #3A4A5C);
  cursor: not-allowed;
}

.tool-chip:hover {
  border-color: rgba(0, 255, 159, 0.35);
  background: rgba(0, 255, 159, 0.06);
  color: var(--nf-accent, #00FF9F);
}

.send-btn {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border: 1px solid var(--nf-accent) !important;
  background: transparent !important;
  color: var(--nf-accent) !important;
  font-size: 12px;
  font-weight: 500;
}

.send-btn:hover {
  border-color: var(--nf-accent-hover) !important;
  background: rgba(0, 255, 159, 0.06) !important;
  color: var(--nf-accent-hover) !important;
  box-shadow: var(--nf-glow-sm);
}

.send-btn.is-disabled,
.send-btn.is-disabled:hover {
  border-color: rgba(255, 255, 255, 0.03) !important;
  color: #3A4A5C !important;
  background: transparent !important;
  box-shadow: none !important;
}

.composer-wrap :deep(.el-textarea__inner) {
  min-height: 72px !important;
  max-height: 320px;
  padding: 12px 4px 8px;
  border: none;
  box-shadow: none !important;
  background: transparent !important;
  background-color: transparent !important;
  color: var(--nf-text-input, #C0CDD8);
  font-size: 13px;
  line-height: 1.65;
  resize: none;
  border-radius: 0;
}

.composer-wrap :deep(.el-textarea),
.composer-wrap :deep(.el-textarea__wrapper) {
  background: transparent !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.composer-wrap :deep(.el-textarea__inner:hover),
.composer-wrap :deep(.el-textarea__inner:focus) {
  box-shadow: none !important;
  border: none;
}

.composer-wrap :deep(.el-textarea__inner::placeholder) {
  color: var(--nf-text-tertiary, #4A5C6E);
}

@media (max-width: 1366px) {
  .chat-sidebar {
    width: 260px;
    min-width: 220px;
  }
}

@media (max-width: 1100px) {
  .chat-sidebar {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(78vw, 300px);
    max-width: min(78vw, 300px);
    transform: translateX(-100%);
    border-right: 1px solid rgba(0, 255, 159, 0.25);
    box-shadow: 8px 0 24px rgba(0, 0, 0, 0.45);
  }

  .chat-sidebar.is-open {
    transform: translateX(0);
  }

  .sidebar-mask {
    display: block;
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 11;
  }
}

@media (max-width: 760px) {
  .chat-content {
    margin: 0;
    padding: 0;
  }

  .composer-wrap {
    width: calc(100% - 16px);
    margin: 0 8px 8px;
    padding: 10px;
  }

  .welcome-panel,
  .message-row {
    width: calc(100% - 16px);
  }

  .composer-actions {
    justify-content: flex-end;
  }

  .user-bubble,
  .ai-bubble {
    max-width: 88%;
  }

  .message-row {
    margin-bottom: 24px;
  }
}
</style>
