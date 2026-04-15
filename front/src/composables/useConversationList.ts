import { ref, computed } from 'vue'
import type { Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { FlowConversationService } from '@/services/flowConversation.service'
import type { LocalConversation, LocalMessage } from '@/types/flowConversation.types'
import type { AIFileRequest } from '@/types/flow.types'
import type { ChatMessage } from './useChatSSE'

export function useConversationList(
  flowId: Ref<string>,
  conversationId: Ref<string>,
  messages: Ref<ChatMessage[]>,
) {
  const { t } = useI18n()

  const conversations = ref<LocalConversation[]>([])
  const isConversationsLoading = ref(false)
  const hasMoreConversations = ref(false)
  const conversationCursor = ref<string | undefined>(undefined)

  const isMessagesLoading = ref(false)
  const messagesHasMore = ref(false)
  const messageCursor = ref<string | undefined>(undefined)
  const messagePageSize = 20

  const sortedConversations = computed(() => {
    return [...conversations.value].sort((a, b) => {
      if (a.isTop !== b.isTop) return a.isTop ? -1 : 1
      const aTime = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0
      const bTime = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0
      return bTime - aTime
    })
  })

  const mapLocalMessageToChatMessages = (msg: LocalMessage): ChatMessage[] => {
    const createdTime = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now()
    const chats: ChatMessage[] = []
    if (msg.question) {
      chats.push({
        role: 'user',
        content: msg.question,
        timestamp: createdTime,
        files: (msg.files as AIFileRequest[] | undefined) || undefined,
      })
    }
    if (msg.answer) {
      chats.push({ role: 'assistant', content: msg.answer, timestamp: createdTime })
    }
    return chats
  }

  const loadMessages = async (reset = true) => {
    if (!conversationId.value || isMessagesLoading.value) return
    isMessagesLoading.value = true

    try {
      const res = await FlowConversationService.getLocalMessages(flowId.value, {
        conversation_id: conversationId.value,
        first_id: reset ? undefined : messageCursor.value,
        limit: messagePageSize,
      })

      const payload = res.data || []
      const mapped = payload.flatMap(mapLocalMessageToChatMessages).sort((a, b) => a.timestamp - b.timestamp)

      messages.value = reset ? mapped : [...mapped, ...messages.value]

      const sourceList = res.data || []
      if (sourceList.length > 0) {
        messageCursor.value = sourceList[sourceList.length - 1].id || undefined
      }
      messagesHasMore.value = res.hasMore ?? false
    }
    catch (error) {
      console.error('Load messages failed', error)
      ElMessage.error(t('flowChat.loadMessagesFailed'))
    }
    finally {
      isMessagesLoading.value = false
    }
  }

  const loadConversations = async (reset = true) => {
    if (isConversationsLoading.value) return
    isConversationsLoading.value = true

    try {
      const res = await FlowConversationService.getLocalConversations(flowId.value, {
        first_id: reset ? undefined : conversationCursor.value,
      })

      const list = res.data || []
      conversations.value = reset ? list : [...conversations.value, ...list]
      hasMoreConversations.value = res.hasMore ?? false
      if (list.length > 0) {
        conversationCursor.value = list[list.length - 1].id || undefined
      }

      if (reset && list.length > 0 && !conversationId.value) {
        conversationId.value = list[0].id || ''
        await loadMessages(true)
      }
    }
    catch (error) {
      console.error('Load conversations failed', error)
      ElMessage.error(t('flowChat.loadConversationsFailed'))
    }
    finally {
      isConversationsLoading.value = false
    }
  }

  const selectConversation = async (conv: LocalConversation) => {
    if (!conv.id) return
    conversationId.value = conv.id
    messageCursor.value = undefined
    messagesHasMore.value = false
    await loadMessages(true)
  }

  const startNewConversation = () => {
    conversationId.value = ''
    messages.value = []
    messageCursor.value = undefined
    messagesHasMore.value = false
  }

  const toggleConversationTop = async (conv: LocalConversation) => {
    if (!conv.id) return
    try {
      await FlowConversationService.toggleConversationTop(flowId.value, conv.id)
      await loadConversations(true)
    }
    catch (error) {
      console.error('Pin failed', error)
      ElMessage.error(t('flowChat.operationFailed'))
    }
  }

  const renameConversation = async (conv: LocalConversation) => {
    if (!conv.id) return
    try {
      const { value } = await ElMessageBox.prompt(t('flowChat.renamePrompt'), t('flowChat.renameConversation'), {
        inputValue: conv.title || '',
        confirmButtonText: t('flowChat.confirm'),
        cancelButtonText: t('flowChat.cancel'),
      })
      await FlowConversationService.updateConversationTitle(flowId.value, conv.id, value)
      await loadConversations(true)
    }
    catch (error) {
      if (error !== 'cancel') {
        console.error('Rename failed', error)
        ElMessage.error(t('flowChat.renameFailed'))
      }
    }
  }

  const deleteConversation = async (conv: LocalConversation) => {
    if (!conv.id) return
    try {
      await ElMessageBox.confirm(t('flowChat.deleteConfirm'), t('flowChat.deleteConversation'), {
        confirmButtonText: t('flowChat.delete'),
        cancelButtonText: t('flowChat.cancel'),
        type: 'warning',
      })
      await FlowConversationService.deleteConversation(flowId.value, conv.id)
      if (conversationId.value === conv.id) startNewConversation()
      await loadConversations(true)
    }
    catch (error) {
      if (error !== 'cancel') {
        console.error('Delete failed', error)
        ElMessage.error(t('flowChat.deleteFailed'))
      }
    }
  }

  return {
    conversations,
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
  }
}
