<script setup>
/**
 * ============================================================================
 *  撒花：30~50 个爱心从屏幕顶部掉落
 *  ---------------------------------------------------------------------------
 *  【为什么不用 Canvas 粒子】
 *    Canvas 粒子要每帧（60fps）执行 JS：清屏 → 更新每颗粒子的速度/重力/旋转
 *    → 重绘。40 颗的话是每秒 2400 次 JS 绘制调用，在骁龙 6 系的老安卓上直接
 *    掉到 20fps，还会和主线程上的其他动画抢时间片。
 *
 *  【纯 CSS 为什么便宜】
 *    每颗爱心就是一个 <span>，只声明 animation。浏览器把它提升为独立的
 *    合成层（will-change: transform, opacity），动画期间只改
 *    transform / opacity 这两个属性 → 完全不触发 layout 和 paint，
 *    由 GPU 合成器直接搬运纹理。JS 主线程一次都不用跑。
 *
 *  【细节】
 *    · animation-fill-mode: both —— 延迟期间也保持 0% 的状态（不可见），
 *      否则爱心会先扎堆出现在顶部再开始掉
 *    · 随机数用固定种子的线性同余（LCG），保证同一轮刷新结果一致，便于调试
 * ========================================================================== */
import { computed, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  /** 爱心数量，建议 30~50 */
  count: { type: Number, default: 44 },
  /** 第几轮（换轮次会重新生成一套随机参数） */
  round: { type: Number, default: 1 },
})
const emit = defineEmits(['finished'])

/** 五种偏暖的粉金色，混着白色才有bling的感觉 */
const TINTS = ['#e88ea8', '#f0b3c4', '#f3cfa2', '#ffffff', '#d98aa4']

/** 线性同余伪随机：给定 seed 就能复现同一套参数 */
function makeRandom(seed) {
  let state = (seed * 9301 + 49297) % 233280
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

const hearts = computed(() => {
  const rand = makeRandom(props.round + 7)
  const list = []
  for (let i = 0; i < props.count; i++) {
    list.push({
      id: `${props.round}-${i}`,
      left: 2 + rand() * 96, // vw 百分比
      size: 12 + rand() * 18, // px
      delay: rand() * 1.5, // s
      duration: 3.4 + rand() * 2.4, // s
      drift: (rand() * 2 - 1) * 70, // 水平漂移 px（风的感觉）
      spin: (rand() * 2 - 1) * 300, // 旋转角度
      tint: TINTS[Math.floor(rand() * TINTS.length)],
    })
  }
  return list
})

/** 这一轮最长的那颗什么时候落完 */
const totalMs = computed(() => {
  const max = hearts.value.reduce((m, h) => Math.max(m, h.delay + h.duration), 0)
  return Math.round(max * 1000) + 400
})

let finishTimer = 0
function scheduleFinish() {
  clearTimeout(finishTimer)
  finishTimer = setTimeout(() => emit('finished'), totalMs.value)
}

// 换轮次（用户又点了一次贴贴）→ 重新计时
watch(() => props.round, scheduleFinish, { immediate: true })

onBeforeUnmount(() => clearTimeout(finishTimer))
</script>

<template>
  <!-- aria-hidden：这层纯装饰，读屏软件不用念 -->
  <div class="rain" aria-hidden="true">
    <span
      v-for="h in hearts"
      :key="h.id"
      class="rain-heart"
      :style="{
        left: h.left + '%',
        fontSize: h.size + 'px',
        color: h.tint,
        '--delay': h.delay + 's',
        '--dur': h.duration + 's',
        '--drift': h.drift + 'px',
        '--spin': h.spin + 'deg',
      }"
      >♥</span
    >
  </div>
</template>

<style scoped>
.rain {
  position: absolute;
  inset: 0;
  z-index: 30;
  overflow: hidden;
  /* 绝对不要让这层吃手势 —— 它只是视觉效果 */
  pointer-events: none;
}

.rain-heart {
  position: absolute;
  top: 0;
  display: block;
  line-height: 1;
  will-change: transform, opacity;
  /* 关键：只动 transform / opacity，GPU 合成，零重排 */
  animation: heartFall var(--dur) linear var(--delay) both;
  /* 加一点点投影，白色爱心在深色星空上也有体积感 */
  text-shadow: 0 1px 4px rgba(120, 60, 80, 0.18);
  /* 不参与布局计算 */
  contain: layout style;
}
</style>
