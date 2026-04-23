<!--
  应用根组件
  根据路由配置动态选择布局组件
 -->
<template>
  <SimpleLayout v-if="layoutType === 'simple'">
    <router-view />
  </SimpleLayout>
  <router-view v-else />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import SimpleLayout from "@/layouts/SimpleLayout.vue";

const route = useRoute();

const layoutType = computed(() => route.meta.layout as string);
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  width: 100%;
  overflow: auto;
  font-family: var(--nf-font-display);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
}

#app {
  min-height: 100%;
  width: 100%;
}


::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--nf-scrollbar);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--nf-scrollbar-hover);
}
</style>
