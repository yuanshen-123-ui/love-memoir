<script setup>
/**
 * ============================================================================
 *  第一关 · 初识心动：13 颗星落在一颗心的轮廓上，全部点亮后心被描出来
 *  ---------------------------------------------------------------------------
 *  为什么不再随机散落：
 *    随机撒星星只是「好看」，而按心形曲线排布，点亮完成的那一刻会自己长成
 *    一颗心 —— 这一下就是这一关存在的意义。
 *
 *  坐标怎么来的（见 utils/heart.js）：
 *    经典心形参数方程 x=16sin³t, y=13cos t−5cos2t−2cos3t−cos4t，
 *    按【等弧长】采样 13 个点并归一化到 0~1，所以间距均匀、不会在心尖挤成一团。
 *
 *  触摸处理：
 *    用 pointerdown 而不是 touchstart —— 一个监听同时覆盖手指和鼠标，而且只触发一次
 *    （touchstart + click 双监听会导致一次点击点亮两次）。.prevent 去掉默认行为。
 *    每颗星的热区固定 44×44（苹果 HIG 的最小可点尺寸），视觉尺寸 20~30 不等。
 *
 *  音效：
 *    点亮第 n 颗星就往上走一个五声音阶 —— 连点像在弹琴，比「叮」一声反馈强得多。
 * ========================================================================== */
import { ref, computed, onMounted } from 'vue'
import { vibrate } from '../utils/misc.js'
import { heartPoints, heartPathD, HEART_STAR_COUNT } from '../utils/heart.js'
import { sfx } from '../audio/sound.js'

const props = defineProps({
  config: { type: Object, required: true },
})
const emit = defineEmits(['done'])

const copy = props.config.star

/** 13 个归一化坐标 + 一点大小/节奏变化（大小用固定公式，保证每次刷新一致） */
const STARS = heartPoints(HEART_STAR_COUNT).map((p, i) => ({
  x: p.x * 100,
  y: p.y * 100,
  // 20~30px 之间交错，用取模而不是随机数：稳定、可复现
  size: 20 + ((i * 7) % 11),
  delay: ((i * 3) % 13) * 0.05,
}))

/** 心形轮廓（描边用） */
const tracePath = heartPathD(120, 0.06)

const lit = ref(new Set())
const allLit = computed(() => lit.value.size === STARS.length)
const finished = ref(false)

/** 路径总长度：拿到才能做「一笔画出来」的 dash 动画 */
const pathEl = ref(null)
const pathLen = ref(0)
onMounted(() => {
  try {
    pathLen.value = pathEl.value ? pathEl.value.getTotalLength() : 0
  } catch {
    pathLen.value = 0
  }
})

const traceStyle = computed(() => {
  const len = pathLen.value
  if (!len) return {}
  return {
    strokeDasharray: `${len}`,
    strokeDashoffset: allLit.value ? '0' : `${len}`,
  }
})

function light(index) {
  if (finished.value || lit.value.has(index)) return

  // 音高顺着已点亮数量往上走
  sfx.star(lit.value.size)

  // Set 必须换成新实例才会触发响应式更新
  const next = new Set(lit.value)
  next.add(index)
  lit.value = next
  vibrate(6)

  if (next.size === STARS.length) {
    finished.value = true
    // 给「心被描出来」留 1.35 秒，再进下一关
    setTimeout(() => emit('done'), 1350)
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

    <div class="star-body">
      <div class="star-field">
        <!-- 心形轮廓：全部点亮后一笔画出来 -->
        <svg
          class="heart-trace"
          :class="{ 'is-on': allLit }"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path ref="pathEl" :d="tracePath" :style="traceStyle" />
        </svg>

        <button
          v-for="(s, i) in STARS"
          :key="i"
          type="button"
          class="star"
          :class="{ 'is-lit': lit.has(i) }"
          :style="{ left: s.x + '%', top: s.y + '%', '--size': s.size + 'px', '--delay': s.delay + 's' }"
          :aria-label="`点亮第 ${i + 1} 颗星`"
          :aria-pressed="lit.has(i)"
          @pointerdown.prevent="light(i)"
        >
          <span class="star-halo" aria-hidden="true"></span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2.4l2.96 6.02 6.64.98-4.8 4.7 1.13 6.6L12 17.6 6.07 20.7l1.13-6.6-4.8-4.7 6.64-.98z"
            />
          </svg>
        </button>
      </div>
    </div>

    <footer class="thumb-bar">
      <p class="star-count">
        <span class="star-count-num">{{ lit.size }}</span> / {{ STARS.length }}
      </p>
      <p class="t-hint">{{ allLit ? copy.done : copy.hint }}</p>
    </footer>
  </section>
</template>

<style scoped>
/* ------------------------------------------------------------ 心形舞台 */
.star-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  padding: 4px 0 8px;
}

.star-field {
  position: relative;
  /* 正方形！因为星星坐标是按 0~1 归一化后分别乘宽高的，
     容器一旦不是正方形，心就会被拉扁 */
  width: min(90vw, 360px, calc(var(--app-h) - 340px));
  aspect-ratio: 1 / 1;
}

/* 心形轮廓 */
.heart-trace {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  overflow: visible;
}
.heart-trace path {
  fill: none;
  stroke: rgba(255, 214, 154, 0);
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: stroke-dashoffset 1.2s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.6s ease;
}
.heart-trace.is-on path {
  stroke: rgba(255, 206, 140, 0.9);
  filter: drop-shadow(0 0 6px rgba(255, 196, 130, 0.85));
}

/* ------------------------------------------------------------------ 星星 */
.star {
  position: absolute;
  /* 热区固定 44×44，视觉大小由 --size 控制；margin 负一半实现「以坐标为圆心」 */
  width: 44px;
  height: 44px;
  margin: -22px 0 0 -22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  /* 入场依次淡入 */
  animation: starIn 0.55s var(--ease-spring) both;
  animation-delay: var(--delay);
  transition: transform 0.22s var(--ease-spring);
  -webkit-tap-highlight-color: transparent;
}
.star:active {
  transform: scale(0.88);
}
.star svg {
  width: var(--size);
  height: var(--size);
  fill: rgba(255, 255, 255, 0.6);
  stroke: rgba(150, 110, 122, 0.3);
  stroke-width: 1;
  filter: drop-shadow(0 2px 6px rgba(170, 120, 130, 0.16));
  transition: fill 0.3s ease, stroke 0.3s ease, filter 0.3s ease, transform 0.34s var(--ease-spring);
  /* 未点亮时轻轻呼吸，暗示「可以点」 */
  animation: starBreath 3.4s ease-in-out infinite alternate;
  animation-delay: var(--delay);
}

/* 点亮：暖金 + 双层光晕 */
.star.is-lit {
  animation: popIn 0.42s var(--ease-spring) both;
}
.star.is-lit svg {
  fill: #ffdf9e;
  stroke: rgba(255, 196, 120, 0.95);
  transform: scale(1.12);
  filter: drop-shadow(0 0 6px rgba(255, 206, 128, 0.95)) drop-shadow(0 0 18px rgba(255, 168, 148, 0.7));
  animation: none;
}

/* 光晕光圈 */
.star-halo {
  position: absolute;
  inset: 6%;
  border-radius: 50%;
  opacity: 0;
  background: radial-gradient(circle, rgba(255, 220, 160, 0.5) 0%, rgba(255, 200, 170, 0) 70%);
  transition: opacity 0.35s ease;
  pointer-events: none;
}
.star.is-lit .star-halo {
  opacity: 1;
  animation: glowPulse 1.8s ease-out 1;
}

/* ------------------------------------------------------------------ 计数 */
.star-count {
  margin: 0 0 6px;
  text-align: center;
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

/* 局部关键帧（只在这一关用得到） */
@keyframes starIn {
  0% {
    opacity: 0;
    transform: scale(0.4);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes starBreath {
  0% {
    opacity: 0.62;
    transform: scale(0.94);
  }
  100% {
    opacity: 1;
    transform: scale(1.02);
  }
}
</style>
