import { createRouter, createWebHashHistory } from 'vue-router'
import Studio from './Studio.vue'

// The main entry and existing /rebuild.html bookmarks use the same workbench.
// Resolve the base from the current entry instead of forcing the old alias.
export const studioRouter = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/agents' },
    { path: '/agents/:id?', component: Studio },
    { path: '/workflows/:id?', component: Studio },
    { path: '/connections', component: Studio },
    { path: '/:pathMatch(.*)*', redirect: '/agents' },
  ],
})
