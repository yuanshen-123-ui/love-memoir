<script setup>
/**
 * ============================================================================
 *  第一关 · 初识心动：散落星星，用手指点亮
 *  ---------------------------------------------------------------------------
 *  触摸处理说明：
 *    · 用 pointerdown 而不是 touchstart —— pointerdown 同时覆盖手指和鼠标，
 *      而且只触发一次（如果用 touchstart + click 双监听，一次点击会被点亮两次）。
 *    · .prevent 阻止默认行为（老安卓上 pointer/touch 的默认行为会带来延迟和
 *      幽灵点击）。
 *    · 星星是 <button>，天然有焦点与无障碍语义；点击区域用 padding 撑大
 *      （视觉上的星星只有 22~34px，热区要做到 ≥ 44px 才好点）。
 * ========================================================================== */
import { ref, computed } from 'vue'
import { vibrate } from '../utils/misc.js'

const props = defineProps({
  config: { type: Object, required: true },
})
const emit = defineEmits(['done'])

const copy = computed(() => props.config.star)

/**
 * 星星坐标（百分比，相对于 stars 区域）。
 * 手写而不是随机生成：随机会让星星每次刷新都乱跳，还可能叠在一起或压住文字。
 * 分布原则：避开正中间（那里留给提示语），四周散开，大小错落。
 */
const STARS = [
  { x: 12, y: 10, size: 30, delay: 0.0 },
  { x: 38, y: 5, size: 22, delay: 0.35 },
  { x: 66, y: 9, size: 27, delay: 0.7 },
  { x: 87, y: 20, size: 23, delay: 1.05 },
  { x: 6, y: 33, size: 24, delay: 0.2 },
  { x: 76, y: 36, size: 32, delay: 0.55 },
  { x: 17, y: 55, size: 26, delay: 0.9 },
  { x: 90, y: 58, size: 21, delay: 0.12 },
  { x: 8, y: 76, size: 21, delay: 0.62 },
  { x: 34, y: 74, size: 30, delay: 0.28 },
  { x: 63, y: 79, size: 24, delay: 0.85 },
  { x: 88, y: 84, size: 26, delay: 0.45 },
]

const lit = ref(new Set())
const allLit = computed(() => lit.value.size === STARS.length)
const finished = ref(false)

/** 点亮一颗 */
function light(index) {
  if (finished.value || lit.value.has(index)) return
  // Set 的直接赋值不会触发响应式，必须换一个新 Set（Vue 3 对 Set 有代理，
  // 但为了不依赖响应式细节，这里显式替换）
  const next = new Set(lit.value)
  next.add(index)
  lit.value = next

  vibrate(6)
  if (next.size === STARS.length) {
    finished.value = true
    // 留 900ms 让人看完最后一下光晕，再进下一关
    setTimeout(() => emit('done'), 900)
  }
}
</script>

<template>
  <section class="screen star-screen">
    <header class="lv-head">
      <p class="lv-kicker">{{ copy.kicker }}</p>
      <h2 class="lv-title">{{ copy.title }}</h2>
      <p class="lv-sub">{{ copy.tip }}</p>
    </header>

    <!-- 星星区域：占满剩余空间，星星按百分比绝对定位 -->
    <div class="star-field">
      <button
        v-for="(s, i) in STARS"
        :key="i"
        type="button"
        class="star"
        :class="{ 'is-lit': lit.has(i) }"
        :style="{
          left: s.x + '%',
          top: s.y + '%',
          '--size': s.size + 'px',
          '--delay': s.delay + 's',
        }"
        :aria-label="`点亮第 ${i + 1} 颗星`"
        :aria-pressed="lit.has(i)"
        @pointerdown.prevent="light(i)"
      >
        <!-- 光晕层：只有点亮后才显示 -->
        <span class="star-halo" aria-hidden="true"></span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 2.4l2.96 6.02 6.64.98-4.8 4.7 1.13 6.6L12 17.6 6.07 20.7l1.13-6.6-4.8-4.7 6.64-.98z"
          />
        </svg>
      </button>

      <!-- 计数：给用户明确的进度感 -->
      <p class="star-count">
        <span class="star-count-num">{{ lit.size }}</span> / {{ STARS.length }}
      </p>
    </div>

    <footer class="thumb-bar">
      <p class="t-hint">{{ allLit ? copy.done : copy.hint }}</p>
    </footer>
  </section>
</template>

<style scoped>
.star-field {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  margin: 10px 0 0;
}

/* ------------------------------------------------------------------ 星星 */
.star {
  position: absolute;
  /* 视觉尺寸受 --size 控制，热区用 padding 撑到 44px 以上（苹果 HIG 的最小可点尺寸） */
  width: max(44px, var(--size));
  height: max(44px, var(--size));
  margin: calc(max(44px, var(--size)) / -2) 0 0 calc(max(44px, var(--size)) / -2);
  display: grid;
  place-items: center;
  border-radius: 50%;
  /* 入场：依次淡入（延迟由 --delay 控制） */
  animation: floatUp 0.5s var(--ease-spring) both;
  animation-delay: var(--delay);
  transition: transform 0.22s var(--ease-spring);
}
.star:active {
  transform: scale(0.9);
}
.star svg {
  width: var(--size);
  height: var(--size);
  fill: rgba(255, 255, 255, 0.55);
  stroke: rgba(150, 110, 122, 0.32);
  stroke-width: 1;
  filter: drop-shadow(0 2px 6px rgba(170, 120, 130, 0.18));
  transition: fill 0.3s ease, stroke 0.3s ease, filter 0.3s ease, transform 0.34s var(--ease-spring);
}

/* 点亮状态：暖金填充 + 双层光晕（drop-shadow 只作用于这一颗，数量少，不心疼） */
.star.is-lit svg {
  fill: #ffdf9e;
  stroke: rgba(255, 196, 120, 0.9);
  transform: scale(1.12);
  filter: drop-shadow(0 0 6px rgba(255, 206, 128, 0.95)) drop-shadow(0 0 18px rgba(255, 168, 148, 0.7));
}
.star.is-lit {
  animation: popIn 0.42s var(--ease-spring) both;
}

/* 光晕光圈 */
.star-halo {
  position: absolute;
  inset: 8%;
  border-radius: 50%;
  opacity: 0;
  background: radial-gradient(circle, rgba(255, 220, 160, 0.55) 0%, rgba(255, 200, 170, 0) 70%);
  transition: opacity 0.35s ease;
  pointer-events: none;
}
.star.is-lit .star-halo {
  opacity: 1;
  animation: glowPulse 1.8s ease-out 1;
}

/* ------------------------------------------------------------------ 计数 */
.star-count {
  position: absolute;
  left: 50%;
  bottom: 2px;
  transform: translateX(-50%);
  margin: 0;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: var(--c-ink-faint);
  font-variant-numeric: tabular-nums;
}
.star-count-num {
  font-size: 15px;
  font-weight: 700;
  color: #b5707f;
}
</style>
