import { ref, reactive, nextTick } from 'vue'
import type { Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useI18n } from 'vue-i18n'

interface FileItem {
  url: string
  name?: string
  size?: number
  mimeType?: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  flowInstanceId?: number
  files?: FileItem[]
}

interface StreamEvent {
  event: 'workflow_started' | 'node_started' | 'node_finished' | 'message' | 'workflow_finished' | 'error'
  data?: {
    conversationId?: string
    flowInstanceId?: number
    createdAt?: number
  }
  answer?: string
  message?: string
  node_id?: string
  node_type?: string
  createdAt?: number
  metadata?: { node_id?: string }
}

export type { FileItem, ChatMessage, StreamEvent }

export function useChatSSE(
  flowId: Ref<string>,
  conversationId: Ref<string>,
  messages: Ref<ChatMessage[]>,
  scrollToBottom: () => void,
  onConversationsRefresh: () => Promise<void>,
) {
  const { t } = useI18n()

  const isLoading = ref(false)
  const currentFlowInstanceId = ref<number | null>(null)
  const currentAIMessage = ref<ChatMessage | null>(null)

  const getUserPhone = (): string => localStorage.getItem('phoneNumber') || 'anonymous'

  const getCommonHeaders = () => {
    const tokenInfo = JSON.parse(localStorage.getItem('tokenInfo') || 'null')
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (tokenInfo?.type && tokenInfo?.accessToken) {
      headers.Authorization = `${tokenInfo.type} ${tokenInfo.accessToken}`
    }
    const phone = localStorage.getItem('phoneNumber')
    if (phone) headers.phoneNumber = phone
    const language = localStorage.getItem('lang') || 'zh-CN'
    headers['Accept-Language'] = language
    headers['X-Language'] = language
    return headers
  }

  const handleStreamEvent = (event: StreamEvent) => {
    switch (event.event) {
      case 'workflow_started':
        if (event.data?.conversationId) conversationId.value = event.data.conversationId
        if (event.data?.flowInstanceId) currentFlowInstanceId.value = event.data.flowInstanceId
        break
      case 'message':
        if (currentAIMessage.value && event.answer) {
          currentAIMessage.value.content += event.answer
          if (currentFlowInstanceId.value && !currentAIMessage.value.flowInstanceId) {
            currentAIMessage.value.flowInstanceId = currentFlowInstanceId.value
          }
        }
        break
      case 'workflow_finished':
        break
      case 'error': {
        const message = event.message || t('flowChat.sendFailed')
        if (currentAIMessage.value) {
          currentAIMessage.value.content = `工作流运行失败：${message}`
        }
        ElMessage.error(message)
        break
      }
    }
  }

  const sendMessage = async (inputMessage: Ref<string>, files: Ref<FileItem[]>, inputRef: Ref<{ focus: () => void } | null>) => {
    if (!inputMessage.value.trim() || isLoading.value) return

    const userMessage = reactive<ChatMessage>({
      role: 'user',
      content: inputMessage.value.trim(),
      timestamp: Date.now(),
      files: files.value.length > 0 ? [...files.value] : undefined,
    })

    messages.value.push(userMessage)
    const query = inputMessage.value.trim()
    const messageFiles = [...files.value]
    inputMessage.value = ''
    files.value = []
    isLoading.value = true
    scrollToBottom()

    try {
      const requestBody = {
        query,
        user: getUserPhone(),
        conversationId: conversationId.value || '',
        files: messageFiles,
      }

      const apiBase = import.meta.env.VITE_API_BASE_URL || ''
      const response = await fetch(`${apiBase}/Flow/chat-messages/${flowId.value}`, {
        method: 'POST',
        headers: getCommonHeaders(),
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) throw new Error(t('flowChat.noResponse'))

      const aiMessage = reactive<ChatMessage>({
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      })
      messages.value.push(aiMessage)
      currentAIMessage.value = aiMessage

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6).trim()
            if (data === '[DONE]') break

            try {
              const event: StreamEvent = JSON.parse(data)
              handleStreamEvent(event)
            }
            catch (e) {
              console.error('Parse event failed:', e, data)
            }
          }
        }
        scrollToBottom()
      }

      if (!aiMessage.content.trim()) {
        aiMessage.content = '工作流已结束，但没有产生回复。请确认流程中存在 Reply 节点，并且 Reply 连接到了 LLM 或其他有输出的节点。'
      }

      currentAIMessage.value = null
      await onConversationsRefresh()
    }
    catch (error) {
      console.error('Failed to send message:', error)
      ElMessage.error(t('flowChat.sendFailed'))

      if (currentAIMessage.value) {
        const index = messages.value.indexOf(currentAIMessage.value)
        if (index > -1) messages.value.splice(index, 1)
        currentAIMessage.value = null
      }
    }
    finally {
      isLoading.value = false
      nextTick(() => inputRef.value?.focus())
    }
  }

  return {
    isLoading,
    currentFlowInstanceId,
    sendMessage,
  }
}
