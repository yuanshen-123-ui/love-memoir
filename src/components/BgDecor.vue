<script setup>
/**
 * 页面背景装饰：主渐变 + 三团柔光（+ 可选夜幕）。
 *
 * 为什么单独抽成组件：
 *   每个页面都需要同一块底色，但「结局要变星空」是页面自己的状态，
 *   所以把「画背景」和「决定要不要天黑」拆开——传 night 就行。
 */
defineProps({
  /** 是否淡入夜幕（结局用） */
  night: { type: Boolean, default: false },
})
</script>

<template>
  <div class="bg" aria-hidden="true">
    <div class="bg-base"></div>
    <span class="bg-orb bg-orb--1"></span>
    <span class="bg-orb bg-orb--2"></span>
    <span class="bg-orb bg-orb--3"></span>
    <div class="bg-night" :class="{ 'is-on': night }"></div>
  </div>
</template>

<style scoped>
.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

/* 主渐变：颜色值的唯一来源是 index.html 的 --bg-grad（首屏内联，没得选） */
.bg-base {
  position: absolute;
  inset: 0;
  background: var(--bg-grad, #f7e2e2);
}

/* 三团柔光：用 radial-gradient 而不是 filter: blur() ——
   模糊一张 70vw 的图层对 GPU 是实打实的开销，而径向渐变本身就已经是柔的 */
.bg-orb {
  position: absolute;
  border-radius: 50%;
  will-change: transform;
  animation: breathe 14s ease-in-out infinite alternate;
}
.bg-orb--1 {
  width: 72vw;
  height: 72vw;
  left: -20vw;
  top: -12vw;
  background: radial-gradient(circle, rgba(255, 238, 202, 0.95) 0%, rgba(255, 238, 202, 0) 68%);
  animation-duration: 13s;
}
.bg-orb--2 {
  width: 64vw;
  height: 64vw;
  right: -22vw;
  top: 18vh;
  background: radial-gradient(circle, rgba(247, 203, 216, 0.85) 0%, rgba(247, 203, 216, 0) 68%);
  animation-duration: 17s;
  animation-delay: -4s;
}
.bg-orb--3 {
  width: 84vw;
  height: 84vw;
  left: -14vw;
  bottom: -26vh;
  background: radial-gradient(circle, rgba(240, 214, 190, 0.8) 0%, rgba(240, 214, 190, 0) 70%);
  animation-duration: 15s;
  animation-delay: -8s;
}

/* 夜幕：结局时从 0 淡入到 1，纯 CSS 渐变，没有图片 */
.bg-night {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 1.1s ease;
  background: radial-gradient(circle at 50% 16%, #33263d 0%, #1b1529 46%, #0d0a15 100%);
}
.bg-night.is-on {
  opacity: 1;
}
</style>
