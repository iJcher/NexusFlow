import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/home/index.vue'),
      meta: { layout: 'simple', requiresAuth: false }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/login/index.vue'),
      meta: { layout: 'simple', requiresAuth: false }
    },
    {
      path: '/dashboard',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { layout: 'none', requiresAuth: true },
      redirect: '/dashboard/ai-flow',
      children: [
        {
          path: 'logic-flow',
          name: 'logicFlow',
          component: () => import('@/views/dashboard/flow-list/index.vue'),
          props: { flowType: 'logic' }
        },
        {
          path: 'ai-flow',
          name: 'aiFlow',
          component: () => import('@/views/dashboard/flow-list/index.vue'),
          props: { flowType: 'ai' }
        },
        {
          path: 'approval-flow',
          name: 'approvalFlow',
          component: () => import('@/views/dashboard/flow-list/index.vue'),
          props: { flowType: 'approval' }
        },
        {
          path: 'llm-provider',
          name: 'llmProvider',
          component: () => import('@/views/dashboard/llm-provider/index.vue')
        }
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
