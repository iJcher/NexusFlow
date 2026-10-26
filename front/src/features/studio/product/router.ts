import { createRouter, createWebHashHistory } from 'vue-router'
import Studio from './Studio.vue'

// Hash history keeps the isolated rebuild entry deployable beside the old app.
// These are independent resource routes, not editor panels inside the library.
export const studioRouter = createRouter({
  history: createWebHashHistory('/rebuild.html'),
  routes: [
    { path: '/', redirect: '/agents' },
    { path: '/agents/:id?', component: Studio },
    { path: '/workflows/:id?', component: Studio },
    { path: '/connections', component: Studio },
    { path: '/:pathMatch(.*)*', redirect: '/agents' },
  ],
})
