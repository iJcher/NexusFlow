<template>
  <div class="w-screen h-screen flex flex-row overflow-hidden chat-bg">
    <aside class="w-80 bg-nf-base border-r border-nf-border flex flex-col p-4 gap-3">
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 font-600 text-nf-text-primary whitespace-nowrap">
          <span>{{ t('flowChat.conversations') || '会话' }}</span>
          <el-tag size="small" type="info">{{ sortedConversations.length }}</el-tag>
        </div>
        <div class="top-btn-row">
          <el-button :icon="Plus" text class="nf-top-btn" @click="startNewConversation">{{ t('flowChat.newConversation') || '新建会话' }}</el-button>
          <el-button :icon="Refresh" text class="nf-top-btn" :loading="isConversationsLoading" @click="loadConversations(true)">{{ t('flowChat.refresh') || '刷新' }}</el-button>
        </div>
      </div>

      <el-scrollbar class="flex-1">
        <div
          v-for="(conv, index) in sortedConversations"
          :key="conv.id || conv.title || index"
          :class="['conv-item', { active: conv.id === conversationId }]"
          @click="selectConversation(conv)"
        >
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2 font-600 text-nf-text-primary leading-tight">
              <span class="truncate">{{ conv.title || t('flowChat.untitledConversation') || '未命名会话' }}</span>
              <el-tag v-if="conv.isTop" size="small" type="warning">{{ t('flowChat.pin') }}</el-tag>
            </div>
            <div class="text-3 text-nf-text-secondary flex items-center gap-1.5 leading-tight">
              <span>{{ formatDateTime(conv.lastMessageTime) }}</span>
              <span class="text-nf-border-light">·</span>
              <span>{{ t('flowChat.messageCount', { count: conv.messageCount || 0 }) }}</span>
            </div>
          </div>
          <div class="mt-2 flex items-center gap-1.5" @click.stop>
            <el-button link size="small" @click="toggleConversationTop(conv)">{{ conv.isTop ? t('flowChat.unpin') : t('flowChat.pin') }}</el-button>
            <el-button link size="small" @click="renameConversation(conv)">{{ t('flowChat.rename') }}</el-button>
            <el-button link size="small" type="danger" @click="deleteConversation(conv)">{{ t('flowChat.delete') }}</el-button>
          </div>
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

    <section class="flex-1 flex flex-col">
      <!-- 顶部工具栏 -->
      <div class="nf-toolbar">
        <div class="flex items-center gap-3">
          <el-button @click="closeWindow" :icon="Close" text class="nf-top-btn">{{ t('flowChat.close') }}</el-button>
          <el-divider direction="vertical" />
        </div>
        <div class="flex items-center gap-3">
          <span class="text-3.25 text-nf-text-secondary leading-none">{{ t('flowChat.flowId') }}: {{ flowId }}</span>
          <el-button 
            @click="clearConversation" 
            :icon="Delete"
            text
            class="nf-top-btn"
          >
            {{ t('flowChat.clearConversation') }}
          </el-button>
        </div>
      </div>

      <!-- 聊天内容区域 -->
      <div class="chat-content" ref="chatContentRef">
        <div v-if="messagesHasMore" class="flex justify-center mb-2">
          <el-button size="small" text :loading="isMessagesLoading" @click="loadMessages(false)">
            {{ t('flowChat.loadMoreMessages') || '加载更多历史消息' }}
          </el-button>
        </div>

        <!-- 欢迎消息 -->
        <div v-if="messages.length === 0" class="text-center py-15 px-5 text-nf-text-secondary">
          <div class="text-16 mb-4">🤖</div>
          <h2 class="text-6 font-600 text-nf-text-primary mb-2">{{ t('flowChat.welcome') }}</h2>
          <p class="text-3.5 text-nf-text-secondary">{{ t('flowChat.welcomeDesc') }}</p>
        </div>

        <!-- 消息列表 -->
        <div v-for="(msg, index) in messages" :key="`msg-${index}-${msg.timestamp}`" class="mb-6">
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
              <el-icon :size="20"><User /></el-icon>
            </div>
          </div>

          <!-- AI消息 -->
          <div v-else class="message ai-message">
            <div class="nf-avatar ai-avatar-bg">
              <el-icon :size="20"><ChatDotRound /></el-icon>
            </div>
            <div class="ai-bubble">
              <div class="message-text" v-html="formatMarkdown(msg.content)"></div>
              
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

        <!-- 加载中指示器 -->
        <div v-if="isLoading" class="message ai-message">
          <div class="nf-avatar ai-avatar-bg">
            <el-icon :size="20"><ChatDotRound /></el-icon>
          </div>
          <div class="ai-bubble">
            <div class="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="px-6 pb-6 pt-4 bg-nf-card border-t border-nf-border shrink-0">
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
        
        <div class="flex gap-3 items-stretch">
          <el-input
            ref="inputRef"
            v-model="inputMessage"
            type="textarea"
            :rows="3"
            :placeholder="t('flowChat.inputPlaceholder')"
            :disabled="isLoading"
            @keydown.enter.exact.prevent="sendMessage"
            class="flex-1"
          />
          <div class="flex items-center gap-2 justify-end">
            <el-button
              :icon="Paperclip"
              circle
              @click="openFileDialog"
              :disabled="isLoading"
              class="attach-btn"
            />
            <el-button
              type="primary"
              :icon="Promotion"
              :loading="isLoading"
              :disabled="isLoading || !inputMessage.trim()"
              @click="sendMessage"
            >
              {{ t('flowChat.send') }}
            </el-button>
          </div>
        </div>
        
        <div class="mt-3 flex items-center gap-2 text-3">
          <el-tag v-if="conversationId" size="small" type="success">
            {{ t('flowChat.conversationId') }}: {{ conversationId }}
          </el-tag>
          <el-tag v-if="currentFlowInstanceId" size="small" type="warning">
            {{ t('flowChat.flowInstanceId') }}: {{ currentFlowInstanceId }}
          </el-tag>
          <el-tag v-if="!conversationId" size="small" type="info">
            {{ t('flowChat.newConversationTip') || '新会话，发送后自动创建' }}
          </el-tag>
        </div>
      </div>

      <!-- 添加文件对话框 -->
      <el-dialog
        v-model="fileDialogVisible"
        :title="t('flowChat.addFile')"
        width="500px"
      >
        <el-form label-width="80px">
          <el-form-item :label="t('flowChat.fileUrl')" required>
            <el-input
              v-model="fileUrl"
              :placeholder="t('flowChat.fileUrlPlaceholder')"
              @keydown.enter.prevent="addFile"
            />
          </el-form-item>
          <el-form-item :label="t('flowChat.fileName')">
            <el-input
              v-model="fileName"
              :placeholder="t('flowChat.fileNamePlaceholder')"
              @keydown.enter.prevent="addFile"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="fileDialogVisible = false">{{ t('flowChat.cancel') }}</el-button>
          <el-button type="primary" @click="addFile">{{ t('flowChat.add') }}</el-button>
        </template>
      </el-dialog>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Close, Delete, User, ChatDotRound, Promotion, Paperclip, Plus, CloseBold, Refresh } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

import type { ChatMessage, FileItem } from '@/composables/useChatSSE'
import { useChatSSE } from '@/composables/useChatSSE'
import { useConversationList } from '@/composables/useConversationList'
import { useMarkdownRenderer } from '@/composables/useMarkdownRenderer'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const flowId = computed(() => route.params.flowId as string)

const messages = ref<ChatMessage[]>([])
const inputMessage = ref('')
const conversationId = ref('')
const chatContentRef = ref<HTMLElement | null>(null)
const inputRef = ref<{ focus: () => void } | null>(null)

const files = ref<FileItem[]>([])
const fileDialogVisible = ref(false)
const fileUrl = ref('')
const fileName = ref('')

const scrollToBottom = () => {
  nextTick(() => {
    if (chatContentRef.value) {
      chatContentRef.value.scrollTop = chatContentRef.value.scrollHeight
    }
  })
}

const convList = useConversationList(flowId, conversationId, messages)
const sse = useChatSSE(flowId, conversationId, messages, scrollToBottom, () => convList.loadConversations(true))
const { formatMarkdown } = useMarkdownRenderer()

const { isLoading, currentFlowInstanceId, sendMessage: sseSend } = sse
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

const formatTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const formatDateTime = (iso?: string | null) => {
  if (!iso) return ''
  return new Date(iso).toLocaleString()
}

const addFile = () => {
  if (!fileUrl.value.trim()) {
    ElMessage.warning(t('flowChat.fileUrlRequired'))
    return
  }
  files.value.push({ url: fileUrl.value.trim(), name: fileName.value.trim() || undefined })
  fileUrl.value = ''
  fileName.value = ''
  fileDialogVisible.value = false
  ElMessage.success(t('flowChat.fileAdded'))
}

const removeFile = (index: number) => {
  files.value.splice(index, 1)
  ElMessage.success(t('flowChat.fileDeleted'))
}

const openFileDialog = () => { fileDialogVisible.value = true }

const clearConversation = () => {
  messages.value = []
  conversationId.value = ''
  ElMessage.success(t('flowChat.conversationCleared'))
  nextTick(() => inputRef.value?.focus())
}

const closeWindow = () => router.back()

onMounted(async () => {
  scrollToBottom()
  nextTick(() => inputRef.value?.focus())
  await loadConversations(true)
})
</script>

<style scoped>
.chat-bg {
  background:
    radial-gradient(circle at 28% 22%, rgba(0, 255, 159, 0.02) 0%, transparent 46%),
    radial-gradient(circle at 74% 68%, rgba(0, 255, 159, 0.015) 0%, transparent 40%),
    var(--nf-bg-base, #020406);
  color: var(--nf-text-body, #8B9DB0);
}

.top-btn-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nf-toolbar {
  height: 52px;
  margin: 10px 12px 0;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(8, 11, 16, 0.9);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nf-top-btn {
  border: 1px solid rgba(0, 255, 159, 0.35) !important;
  color: var(--nf-accent, #00FF9F) !important;
  background: transparent !important;
  border-radius: 6px;
  padding: 6px 10px;
  transition: border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.nf-top-btn:hover {
  border-color: rgba(0, 255, 159, 0.5) !important;
  color: var(--nf-accent-hover, #33FFB3) !important;
  background: rgba(0, 255, 159, 0.06) !important;
  box-shadow: 0 0 6px rgba(0, 255, 159, 0.25);
}

.nf-top-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(0, 255, 159, 0.08);
}

.nf-top-btn :deep(.el-icon) {
  color: inherit;
}

.conv-item {
  background: rgba(8, 11, 16, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.conv-item:hover {
  border-color: rgba(0, 255, 159, 0.3);
  background: rgba(14, 18, 26, 0.86);
  box-shadow: 0 0 8px rgba(0, 255, 159, 0.16);
}

.conv-item.active {
  border-color: rgba(0, 255, 159, 0.5);
  background: rgba(0, 255, 159, 0.06);
  box-shadow: 0 0 10px rgba(0, 255, 159, 0.2);
}

.chat-content {
  flex: 1;
  padding: 20px 24px;
  overflow-y: auto;
  background: rgba(8, 11, 16, 0.9);
  margin: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  animation: messageSlideIn 0.25s ease-out;
}

@keyframes messageSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-message { justify-content: flex-end; }

.user-bubble {
  background: var(--nf-accent-muted);
  color: var(--nf-text-primary, #E6EDF3);
  border-radius: 16px 16px 4px 16px;
  padding: 12px 16px;
  max-width: 70%;
  border: 1px solid rgba(0, 255, 159, 0.35);
}

.user-avatar-bg {
  background: var(--nf-bg-muted);
  color: var(--nf-text-primary);
}

.ai-avatar-bg {
  background: var(--nf-avatar-gradient);
  color: var(--nf-avatar-text);
}

.ai-message { justify-content: flex-start; }

.ai-bubble {
  background: rgba(14, 18, 26, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px 16px 16px 4px;
  padding: 12px 16px;
  max-width: 70%;
}

.message-text {
  font-family: var(--nf-font-display);
  font-size: 14px;
  line-height: 1.7;
  letter-spacing: 0.02em;
  word-wrap: break-word;
  white-space: pre-wrap;
  color: var(--nf-text-body, #8B9DB0);
}

.message-text :deep(p) { margin: 0; padding: 0; }

.message-text :deep(pre) {
  background: var(--nf-bg-muted);
  padding: 10px 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.message-text :deep(code) {
  background: var(--nf-bg-muted);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--nf-font-mono);
  font-size: 13px;
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
  font-size: 13px;
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

.typing-indicator { display: flex; gap: 4px; padding: 8px 0; }

.typing-indicator span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--nf-text-muted);
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
.typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
  30% { transform: translateY(-8px); opacity: 1; }
}

.attach-btn {
  width: 40px;
  height: 40px;
  border: 1px solid var(--nf-border-light) !important;
  color: var(--nf-accent) !important;
  transition: all 0.15s ease;
}

.attach-btn:hover {
  border-color: var(--nf-accent) !important;
  background: var(--nf-accent-muted) !important;
}

.chat-content::-webkit-scrollbar { width: 6px; }
.chat-content::-webkit-scrollbar-track { background: transparent; }
.chat-content::-webkit-scrollbar-thumb { background: var(--nf-scrollbar); border-radius: 3px; }
.chat-content::-webkit-scrollbar-thumb:hover { background: var(--nf-scrollbar-hover); }
</style>
