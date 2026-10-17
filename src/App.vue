<script setup>
/**
 * ============================================================================
 *  根组件（外壳）
 * ---------------------------------------------------------------------------
 *  只放「每一页都要有」的东西：
 *    · SoundToggle  右上角声音开关
 *    · RotateTip    横屏提示
 *    · ToastHost    自定义提示（代替原生 alert）
 *    · 错误兜底     任何页面渲染崩了都给一张卡片，而不是白屏
 *    · RouterView   页面本体（/ 、/a/:id 、/letter）
 *
 *  页面自己的背景（光球、夜幕）在各页面里用 <BgDecor> 铺，
 *  因为「结局要变星空」这种状态是页面自己的事，不该提到外壳里。
 * ========================================================================== */
import { ref, onErrorCaptured } from 'vue'
import { RouterView } from 'vue-router'

import { CONFIG } from './config.js'
import { useViewportHeight } from './composables/useViewport.js'
import SoundToggle from './components/SoundToggle.vue'
import RotateTip from './components/RotateTip.vue'
import ToastHost from './components/ToastHost.vue'
import GlassButton from './components/GlassButton.vue'

const ui = CONFIG.ui
const errorMsg = ref('')

/* 真实视口高度 → CSS 变量 --app-h（手机地址栏伸缩时 100vh 会算错） */
useViewportHeight()

onErrorCaptured((err, _instance, info) => {
  console.error('[love-memoir] 渲染异常：', info, err)
  errorMsg.value = String((err && err.message) || err || 'UNKNOWN')
  return false
})

function reloadPage() {
  try {
    window.location.reload()
  } catch {
    /* 忽略 */
  }
}
</script>

<template>
  <div class="shell">
    <SoundToggle v-if="!errorMsg" :config="CONFIG" />

    <!-- 页面本体：切页时做一次轻柔的淡入淡出 -->
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>

    <ToastHost />
    <RotateTip :config="CONFIG" />

    <!-- 兜底错误页：宁可给一张卡片，也不要白屏 -->
    <Transition name="fade">
      <div v-if="errorMsg" class="err-overlay">
        <div class="err-card glass glass--strong">
          <p class="err-title">{{ ui.errorTitle }}</p>
          <p class="err-desc">{{ ui.errorDesc }}</p>
          <GlassButton block @click="reloadPage">{{ ui.errorAction }}</GlassButton>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.shell {
  position: relative;
  height: 100%;
  overflow: hidden;
}

/* 切页过渡：只动 opacity，避免布局跳动 */
.page-enter-active,
.page-leave-active {
  transition: opacity 0.28s ease;
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
}

/* ------------------------------------------------------------- 错误兜底 */
.err-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(58, 38, 46, 0.3);
}
.err-card {
  width: min(88vw, 340px);
  padding: 26px 22px 20px;
  border-radius: 24px;
  text-align: center;
}
.err-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: #6d4a52;
}
.err-desc {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--c-ink-soft);
}
</style>
