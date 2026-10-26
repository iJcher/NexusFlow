<script setup lang="ts">
import type { IMcpConnection } from '@/types/execution-v2.types'
import { onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { McpService } from '@/services/v2/mcp.service'
import ProductModal from './ProductModal.vue'
import { toast } from './toasts'

const props = defineProps<{ workspace: string, canManage: boolean }>()
const emit = defineEmits<{ changed: [] }>()
const { t, te } = useI18n()
const tr = (key: string) => t(`product.${key}`)
const items = ref<IMcpConnection[]>([])
const selected = ref<IMcpConnection | null>(null)
const creating = ref(false)
const busy = ref(false)
const loaded = ref(false)
const name = ref('')
const url = ref('')
const auth = ref('none')
const token = ref('')
async function work(fn: () => Promise<void>) {
  if (busy.value)
    return
  busy.value = true
  try {
    await fn()
  }
  catch (error) {
    const code = error instanceof Error ? error.message.split(/[ ·]/)[0] : ''
    toast(te(`product.errors.${code}`) ? tr(`errors.${code}`) : tr('errors.operationFailed'))
  }
  finally { busy.value = false }
}
async function load() {
  const workspace = props.workspace
  const result = await McpService.list()
  if (props.workspace === workspace) {
    items.value = result
    loaded.value = true
  }
}
function edit(item: IMcpConnection) {
  selected.value = JSON.parse(JSON.stringify(item)) as IMcpConnection
  token.value = ''
}
function create() {
  void work(async () => {
    const item = await McpService.create({ name: name.value.trim(), url: url.value.trim(), authType: auth.value, ...(auth.value === 'bearer' ? { token: token.value } : {}) })
    token.value = ''
    name.value = ''
    url.value = ''
    creating.value = false
    await load()
    edit(item)
    toast(tr('connectionCreated'), 'success')
  })
}
function discover() {
  const item = selected.value
  if (!item)
    return
  void work(async () => {
    selected.value = await McpService.discover(item.id)
    await load()
    emit('changed')
    toast(tr('discoveryDone'), 'success')
  })
}
function save() {
  const item = selected.value
  if (!item)
    return
  void work(async () => {
    await McpService.update(item, token.value || undefined)
    token.value = ''
    selected.value = null
    await load()
    emit('changed')
    toast(tr('connectionSaved'), 'success')
  })
}
onMounted(() => work(load))
watch(() => props.workspace, () => {
  items.value = []
  selected.value = null
  creating.value = false
  token.value = ''
  loaded.value = false
  void work(load)
})
</script>

<template>
  <section class="connection-manager">
    <header class="connection-heading">
      <div>
        <span class="eyebrow">MCP</span><h1>{{ tr('connections') }}</h1><p class="muted">
          {{ tr('connectionsHint') }}
        </p>
      </div>
      <button v-if="canManage" class="btn btn-primary" :disabled="busy" @click="creating = true; token = ''">
        ＋ {{ tr('connectService') }}
      </button>
    </header>
    <p class="field-hint">
      {{ tr('connectionScope') }}
    </p>
    <section v-if="!loaded" class="product-empty">
      <p>{{ tr('loading') }}</p><button class="btn btn-secondary" :disabled="busy" @click="work(load)">
        {{ tr('retry') }}
      </button>
    </section>
    <div v-else-if="items.length" class="connection-list">
      <button v-for="item in items" :key="item.id" class="connection-card" @click="edit(item)">
        <span class="resource-icon">⌘</span><div>
          <h2>{{ item.name }}</h2><p class="muted">
            {{ item.url }}
          </p><small>{{ item.readTools.length }} {{ tr('authorizedTools') }}</small>
        </div><span class="tiny-badge">{{ tr(item.enabled ? 'connectionEnabled' : 'connectionDisabled') }}</span><span>↗</span>
      </button>
    </div>
    <section v-else class="product-empty">
      <span class="empty-symbol">⌘</span><h2>{{ tr('noConnections') }}</h2><p>{{ tr('noConnectionsHint') }}</p>
    </section>
    <ProductModal v-if="creating" :title="tr('connectService')" @close="!busy && (creating = false); token = ''">
      <form id="mcp-create" @submit.prevent="create">
        <label class="form__field">{{ tr('connectionName') }}<input v-model="name" class="input" required maxlength="128"></label>
        <label class="form__field">{{ tr('serviceAddress') }}<input v-model="url" class="input" type="url" required maxlength="2048" placeholder="https://…/mcp"><small class="field-hint">{{ tr('mcpTransportHint') }}</small></label>
        <label class="form__field">{{ tr('authentication') }}<select v-model="auth" class="input"><option value="none">{{ tr('noAuthentication') }}</option><option value="bearer">Bearer Token</option></select></label>
        <label v-if="auth === 'bearer'" class="form__field">{{ tr('credential') }}<input v-model="token" class="input" type="password" autocomplete="new-password" required><small class="field-hint">{{ tr('credentialHint') }}</small></label>
      </form>
      <template #footer>
        <button class="btn btn-primary" type="submit" form="mcp-create" :disabled="busy">
          {{ tr('createConnection') }}
        </button>
      </template>
    </ProductModal>
    <ProductModal v-if="selected" :title="selected.name" wide @close="!busy && (selected = null); token = ''">
      <p class="connection-url">
        {{ selected.url }}
      </p>
      <div class="connection-discovery">
        <div>
          <h3>{{ tr('discoverTools') }}</h3><p class="muted">
            {{ tr('discoveryHint') }}
          </p>
        </div><button class="btn btn-secondary" :disabled="busy || !canManage" @click="discover">
          {{ busy ? tr('connecting') : tr('testAndDiscover') }}
        </button>
      </div>
      <p class="field-hint">
        {{ tr('readAuthorizationHint') }}
      </p>
      <div class="connection-tools">
        <label v-for="tool in selected.tools" :key="tool.name" class="connection-tool"><input v-model="selected.readTools" type="checkbox" :value="tool.name" :disabled="busy || !canManage || !tool.reportedReadOnly || tool.reportedDestructive"><div><strong>{{ tool.name }}</strong><p>{{ tool.description }}</p><small class="muted">{{ tr(tool.reportedReadOnly && !tool.reportedDestructive ? 'authorizeRead' : 'writeToolUnavailable') }}</small></div></label>
        <p v-if="!selected.tools.length" class="muted">
          {{ tr('discoverFirst') }}
        </p>
      </div>
      <label class="connection-enable"><input v-model="selected.enabled" type="checkbox" :disabled="busy || !canManage">{{ tr('enableConnection') }}</label>
      <details v-if="selected.hasCredential && canManage" class="product-disclosure">
        <summary>{{ tr('replaceCredential') }}</summary><label class="form__field">{{ tr('newCredential') }}<input v-model="token" type="password" autocomplete="new-password" class="input"></label>
      </details>
      <template #footer>
        <button v-if="canManage" class="btn btn-primary" :disabled="busy" @click="save">
          {{ tr('saveAuthorization') }}
        </button>
      </template>
    </ProductModal>
  </section>
</template>

<style scoped lang="scss">
.connection-heading,
.connection-discovery {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
}
.connection-heading h1 {
  margin: 8px 0;
}
.connection-heading p {
  max-width: 60ch;
}
.connection-list {
  display: grid;
  gap: 14px;
  margin-top: 32px;
}
.connection-card {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  text-align: left;
  background: var(--color-bg-raised);
  cursor: pointer;
}
.connection-card > div {
  flex: 1;
  min-width: 0;
}
.connection-card h2 {
  font-size: 17px;
  margin: 0 0 8px;
}
.connection-card p,
.connection-url {
  overflow-wrap: anywhere;
}
.connection-card:hover {
  border-color: var(--color-accent-orange);
}
.connection-discovery {
  margin: 24px 0 12px;
}
.connection-discovery h3 {
  margin: 0;
}
.connection-tools {
  max-height: 42vh;
  overflow: auto;
  border-block: 1px solid var(--color-border);
  margin-block: 16px;
}
.connection-tool {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 4px;
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
}
.connection-tool p {
  margin: 8px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 13px;
}
.connection-enable {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-block: 22px;
}
@media (max-width: 700px) {
  .connection-heading,
  .connection-discovery {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
  }
  .connection-card {
    padding: 16px;
    gap: 12px;
    flex-wrap: wrap;
  }
}
</style>
