<script setup lang="ts">
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { computed } from 'vue'

const props = defineProps<{ text: string }>()
const html = computed(() => {
  const clean = DOMPurify.sanitize(marked.parse(props.text, { async: false, breaks: true }), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'blockquote', 'code', 'pre', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'],
    ALLOWED_ATTR: ['href', 'title'],
  })
  const document = new DOMParser().parseFromString(clean, 'text/html')
  for (const link of document.querySelectorAll('a')) {
    if (!/^https:\/\//i.test(link.getAttribute('href') || '')) {
      link.removeAttribute('href')
      continue
    }
    link.setAttribute('target', '_blank')
    link.setAttribute('rel', 'noopener noreferrer')
  }
  return document.body.innerHTML
})
</script>

<template>
  <!-- All HTML passes the local tag/attribute allowlist; links are HTTPS only. -->
  <div class="markdown-text" v-html="html" />
</template>
