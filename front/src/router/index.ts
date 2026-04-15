import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/about'
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
      meta: { layout: 'simple', requiresAuth: false }
    },
    {
      path: '/about',
      name: 'about',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/about/index.vue') }
      ]
    },
    {
      path: '/studio',
      name: 'studio',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/studio/index.vue') }
      ]
    },
    {
      path: '/templates',
      name: 'templates',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/templates/index.vue') }
      ]
    },
    {
      path: '/knowledge',
      name: 'knowledge',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/knowledge/index.vue') }
      ]
    },
    {
      path: '/models',
      name: 'models',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '', component: () => import('@/views/dashboard/llm-provider/index.vue') }
      ]
    },
    {
      path: '/designer/:flowType/:id?',
      name: 'flowDesigner',
      component: () => import('@/views/flow/designer/index.vue'),
      meta: { layout: 'simple', requiresAuth: true }
    },
    {
      path: '/flow/chat-test/:flowId',
      name: 'flowChatTest',
      component: () => import('@/views/flow/chat-test/index.vue'),
      meta: { layout: 'simple', requiresAuth: true }
    }
  ]
})

router.beforeEach(async (to, _from, next) => {
  const authStore = useAuthStore()

  if (to.path === '/login') {
    next()
    return
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth)
  if (requiresAuth && !authStore.getIsAuthenticated) {
    next('/login')
    return
  }

  next()
})

export default router
