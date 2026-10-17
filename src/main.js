import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './style.css'

/**
 * 三条路由：
 *   /           创作页（访客进来自己填内容 → 生成分享链接）   ← 首页
 *   /a/:id      播放页（别人打开分享链接看到的那一面）
 *   /letter     最早那封「只能给她看」的固定版（保留，没删）
 *
 * 用 history 模式（不要 #/），分享出去的链接才好看：https://love.ccflysim.cn/a/Zm9vYmFy
 * 代价是服务器要把未知路径都回落到 index.html —— nginx 已经配了 try_files。
 */
const router = createRouter({
  history: createWebHistory('/'),
  routes: [
    { path: '/', name: 'create', component: () => import('./views/CreateView.vue') },
    { path: '/a/:id', name: 'album', component: () => import('./views/AlbumView.vue') },
    { path: '/letter', name: 'letter', component: () => import('./views/LetterView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

createApp(App).use(router).mount('#app')
