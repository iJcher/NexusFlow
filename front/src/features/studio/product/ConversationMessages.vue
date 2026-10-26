<script setup lang="ts">
import type { ComputedRef } from 'vue'
import type { IAnswerMessage } from './answerProjection'
import type { IRunView } from '@/types/execution-v2.types'
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import MarkdownText from './MarkdownText.vue'
import ResultView from './ResultView.vue'

const props = defineProps<{ input: Record<string, unknown>, messages: IAnswerMessage[], view: IRunView, name: string, trimmed: boolean }>()
const { t } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const labels = inject<ComputedRef<Record<string, string>>>('resultLabels', computed(() => ({})))
const done = computed(() => ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'NEEDS_ATTENTION'].includes(props.view.status))
const plainInput = computed(() => Object.keys(props.input).length === 1 && typeof Object.values(props.input)[0] === 'string' ? String(Object.values(props.input)[0]) : null)
function title(message: IAnswerMessage) {
  const invocation = props.view.invocations.find(item => item.id === message.invocation)
  return labels.value[invocation?.node_id || message.invocation.split('/node/').at(-1) || ''] || props.name
}
</script>

<template>
  <article class="conversation-input">
    <span class="eyebrow">{{ tr('you') }}</span>
    <p v-if="plainInput !== null" class="user-message-text">
      {{ plainInput }}
    </p>
    <ResultView v-else :value="input" />
  </article>
  <slot />
  <p v-if="trimmed" class="muted">
    {{ tr('streamTrimmed') }}
  </p>
  <article v-for="message in messages" :key="message.id" class="conversation-answer" :data-message-id="message.id" :data-invocation="message.invocation">
    <header><strong>✳ {{ title(message) }}</strong><small class="muted">{{ tr(message.status === 'INTERRUPTED' || (done && (view.status !== 'SUCCEEDED' || message.status !== 'VALIDATED')) ? 'streamInterrupted' : message.status === 'VALIDATED' ? 'streamValidated' : 'streamDraft') }}</small></header>
    <details v-if="done" class="stream-history">
      <summary>{{ tr('generationRecord') }}</summary>
      <dl class="result-fields">
        <div v-for="(text, key) in message.fields" :key="key">
          <dt>{{ labels[String(key)] || (key === 'summary' ? tr('fields.summary') : tr('answer')) }}</dt><dd class="stream-text">
            <MarkdownText :text="text" />
          </dd>
        </div>
      </dl>
    </details>
    <dl v-else class="result-fields">
      <div v-for="(text, key) in message.fields" :key="key">
        <dt>{{ labels[String(key)] || (key === 'summary' ? tr('fields.summary') : tr('answer')) }}</dt><dd class="stream-text" data-testid="stream-text">
          <MarkdownText :text="text" /><span v-if="message.status === 'GENERATING'" class="stream-caret" aria-hidden="true">▍</span>
        </dd>
      </div>
    </dl>
  </article>
</template>
