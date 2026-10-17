<script setup>
/**
 * 横屏提示
 *  ---------------------------------------------------------------------------
 *  这个页面是「竖屏叙事」的结构（相框、心形、明信片都是竖着排的），
 *  横过来会挤成一团。与其做一套横屏布局（收益极低），不如直接礼貌地请她转回来。
 *
 *  纯 CSS 控制显隐（@media (orientation: landscape) and (max-height: 540px)），
 *  不占 JS，也不会在竖屏时留下任何 DOM 负担。
 * ========================================================================== */
defineProps({
  config: { type: Object, required: true },
})
</script>

<template>
  <div class="rotate-tip" aria-hidden="true">
    <div class="rotate-icon">
      <span class="rotate-phone"></span>
    </div>
    <p class="rotate-text">{{ config.ui.rotate }}</p>
  </div>
</template>

<style scoped>
.rotate-tip {
  display: none;
}

/* 只在「横屏且高度很矮」时接管整个屏幕：竖屏手机、桌面浏览器都不受影响 */
@media (orientation: landscape) and (max-height: 540px) {
  .rotate-tip {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 22px;
    padding: 24px;
    text-align: center;
    background: var(--bg-grad, #f7e2e2);
  }
}

.rotate-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  color: #b5707f;
}

/* 一个被转正的小手机图标 */
.rotate-phone {
  display: block;
  width: 26px;
  height: 42px;
  border-radius: 7px;
  border: 2px solid currentColor;
  position: relative;
  transform-origin: 50% 50%;
  animation: rotateHint 2.4s ease-in-out infinite;
}
.rotate-phone::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 5px;
  width: 8px;
  height: 2px;
  border-radius: 1px;
  background: currentColor;
  transform: translateX(-50%);
  opacity: 0.6;
}

@keyframes rotateHint {
  0%,
  18% {
    transform: rotate(90deg);
  }
  46%,
  72% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(90deg);
  }
}

.rotate-text {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.5px;
  color: #6d4a52;
}
</style>
