<script setup lang="ts">
import type { IInvocation } from '@/types/execution-v2.types'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { record } from './editor'

const props = defineProps<{ invocations: IInvocation[] }>()
const { t } = useI18n()
const sources = computed(() => {
  const collected = new Map<string, { url: string, title: string, time: string }>()
  for (const invocation of props.invocations) {
    if (invocation.kind !== 'tool')
      continue
    const output = record(invocation.output)
    if (output.ok !== true || output.toolVersion !== 'public-research-1' || typeof output.sourceUrl !== 'string')
      continue
    try {
      const url = new URL(output.sourceUrl)
      if (url.protocol !== 'https:' || url.username || url.password)
        continue
      const repository = record(output.repository)
      const section = record(invocation.input).section
      const title = String(output.title || repository.full_name || (['web_read', 'github_search', 'github_repository'].includes(invocation.node_id) ? t(`product.${invocation.node_id}`) : t('product.publicReadSource')))
      const time = typeof output.retrievedAt === 'string' ? output.retrievedAt : ''
      collected.set(url.href, { url: url.href, title: section ? `${title} · ${t(`product.toolEnums.${section}`)}` : title, time })
    }
    catch {
      continue
    }
  }
  return [...collected.values()].slice(-20)
})
</script>

<template>
  <section v-if="sources.length" class="source-references" data-testid="tool-sources">
    <h3>{{ t('product.actualSources') }}</h3>
    <ul>
      <li v-for="source in sources" :key="source.url">
        <a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a><small v-if="source.time">{{ new Date(source.time).toLocaleString() }}</small>
      </li>
    </ul>
  </section>
</template>
