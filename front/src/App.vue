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
  font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
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
  background: #161b22;
}

::-webkit-scrollbar-thumb {
  background: #2f3336;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #484f58;
}
</style>
