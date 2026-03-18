/**
 * 路由配置文件
 * 流程列表在 AdminLayout 中通过 Tab 切换展示，不使用路由
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: {
        layout: 'simple',
        requiresAuth: false
      }
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      meta: {
        layout: 'simple',
        requiresAuth: false
      }
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: {
        layout: 'none',
        requiresAuth: true
      }
    },
    {
      path: '/designer/:flowType/:id?',
      name: 'flowDesigner',
      component: () => import('@/views/flow/FlowDesigner.vue'),
      meta: {
        layout: 'simple',
        requiresAuth: true,
        title: '流程设计器'
      }
    },
    {
      path: '/flow/chat-test/:flowId',
      name: 'flowChatTest',
      component: () => import('@/views/flow/FlowChatTest.vue'),
      meta: {
        layout: 'simple',
        requiresAuth: true,
        title: 'AI工作流测试'
      }
    }
  ]
})

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  if (to.path === '/login') {
    next()
    return
  }

  if (to.meta.requiresAuth && !authStore.getIsAuthenticated) {
    next('/login')
    return
  }

  next()
})

export default router
