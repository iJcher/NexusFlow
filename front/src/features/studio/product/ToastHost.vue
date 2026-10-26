<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { dismissToast, toasts } from './toasts'

const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <section class="product-toasts" :aria-label="t('product.notifications')">
      <TransitionGroup name="toast">
        <div v-for="item in toasts" :key="item.id" class="product-toast" :class="`product-toast--${item.kind}`" :role="item.kind === 'error' ? 'alert' : 'status'" :aria-live="item.kind === 'error' ? 'assertive' : 'polite'">
          <span aria-hidden="true">{{ item.kind === 'error' ? '!' : item.kind === 'success' ? '✓' : 'i' }}</span>
          <p>{{ item.message }}</p>
          <button class="btn btn-icon" :aria-label="t('product.dismiss')" @click="dismissToast(item.id)">
            ×
          </button>
        </div>
      </TransitionGroup>
    </section>
  </Teleport>
</template>
