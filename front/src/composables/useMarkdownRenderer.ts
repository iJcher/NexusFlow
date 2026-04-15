import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useI18n } from 'vue-i18n'

export function useMarkdownRenderer() {
  const { t } = useI18n()

  const THINK_OPEN = '<think>'
  const THINK_CLOSE = '</think>'

  const formatMarkdown = (text: string): string => {
    if (!text) return ''

    let result = ''
    let remaining = text

    while (remaining.length > 0) {
      const thinkStart = remaining.indexOf(THINK_OPEN)

      if (thinkStart === -1) {
        result += marked(remaining, { breaks: true }) as string
        break
      }

      if (thinkStart > 0) {
        result += marked(remaining.substring(0, thinkStart), { breaks: true }) as string
      }

      const thinkEnd = remaining.indexOf(THINK_CLOSE, thinkStart)

      if (thinkEnd === -1) {
        const thinkContent = remaining.substring(thinkStart + THINK_OPEN.length)
        result += `<div class="thinking-block thinking-streaming">
          <div class="thinking-header">
            <span class="thinking-icon">🧠</span>
            <span class="thinking-title">${t('flowChat.thinkingProcess')}</span>
            <span class="thinking-indicator">...</span>
          </div>
          <div class="thinking-content">${DOMPurify.sanitize(thinkContent)}</div>
        </div>`
        break
      }
      else {
        const thinkContent = remaining.substring(thinkStart + THINK_OPEN.length, thinkEnd)
        result += `<div class="thinking-block">
          <div class="thinking-header">
            <span class="thinking-icon">🧠</span>
            <span class="thinking-title">${t('flowChat.thinkingProcess')}</span>
          </div>
          <div class="thinking-content">${DOMPurify.sanitize(thinkContent.trim())}</div>
        </div>`

        remaining = remaining.substring(thinkEnd + THINK_CLOSE.length)
      }
    }

    return DOMPurify.sanitize(result)
  }

  return { formatMarkdown }
}
