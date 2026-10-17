<script setup>
/**
 * ============================================================================
 *  第二关 · 专属记忆：Canvas 刮刮乐
 *  ---------------------------------------------------------------------------
 *  实现思路（三层结构）：
 *    底层 <img>  = 我们的照片（不参与任何绘制，纯静态，省性能）
 *    上层 <canvas> = 一层盖住照片的雾面遮罩，用 destination-out 擦除
 *
 *  为什么用 destination-out：
 *    它是 canvas 的「擦除」合成模式 —— 画什么就把什么从画布上抠掉（变透明），
 *    所以我们不是「画白色」，而是真的让遮罩消失、露出下面照片。
 *
 *  为什么笔刷用径向渐变：
 *    直接 fill 一个实心圆，边缘会有硬锯齿；用「中心不透明 → 边缘透明」的
 *    径向渐变当笔刷，擦除出来的边缘是柔和过渡的，像用手指抹开雾。
 *
 *  为什么沿路径插值补点：
 *    手指移动事件是离散采样的，滑得快时两帧之间可能隔 60px，
 *    只在采样点盖章会得到一串虚线。所以用 lineTo 思路手工插值。
 *
 *  性能注意：
 *    · devicePixelRatio 封顶 2（3 倍屏只多花 2.25 倍像素，肉眼几乎看不出差别）
 *    · getImageData 是同步回读，很贵 → 节流 200ms 才检查一次进度
 *    · 只动 canvas 的 opacity 做淡出，不重新绘制
 * ========================================================================== */
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import GlassButton from './GlassButton.vue'
import { vibrate } from '../utils/misc.js'
import { sfx } from '../audio/sound.js'

const props = defineProps({
  /** 开场选中的照片（dataURL） */
  photo: { type: String, required: true },
  config: { type: Object, required: true },
})
const emit = defineEmits(['done'])

const copy = props.config.scratch

const canvasEl = ref(null)
const stageEl = ref(null)
const revealed = ref(false)
/** 已刮开比例 0~1，仅用于调试/验收，不展示给用户 */
const progress = ref(0)

/** 柔和笔刷半径（CSS 像素） */
const BRUSH = 30
/** 刮开多少比例算「刮开」 */
const REVEAL_RATIO = 0.55

let ctx = null
let cssW = 0
let cssH = 0
let dpr = 1
let last = null
let drawing = false
let lastCheck = 0
let rafId = 0

/* ========================================================================== */
/*  1. 初始化画布                                                             */
/* ========================================================================== */
function setupCanvas() {
  const canvas = canvasEl.value
  const stage = stageEl.value
  if (!canvas || !stage) return

  const rect = stage.getBoundingClientRect()
  if (rect.width < 20 || rect.height < 20) {
    // 布局还没稳定（比如屏间过渡进行中）→ 下一帧再来
    rafId = requestAnimationFrame(setupCanvas)
    return
  }

  cssW = Math.round(rect.width)
  cssH = Math.round(rect.height)
  // 封顶 2 倍：3x 屏的 3 倍画布对刮刮乐毫无意义，只会让老机型掉帧
  dpr = Math.min(2, window.devicePixelRatio || 1)

  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = `${cssW}px`
  canvas.style.height = `${cssH}px`

  ctx = canvas.getContext('2d', { alpha: true })
  // 关键：把坐标系缩放成 CSS 像素，之后所有绘制都按 CSS 像素写，省掉手算 dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  paintCover()
}

/** 画初始雾面遮罩 */
function paintCover() {
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, cssW, cssH)

  // 香槟金 → 冷玫瑰 的斜向渐变，和全站配色一致
  const g = ctx.createLinearGradient(0, 0, cssW, cssH)
  g.addColorStop(0, '#f7e4c8')
  g.addColorStop(0.48, '#f5dade')
  g.addColorStop(1, '#e9bccb')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, cssW, cssH)

  // 几团柔光，让雾面不是一块死板的渐变
  const blobs = [
    { x: 0.22, y: 0.2, r: 0.55, c: 'rgba(255,255,255,0.55)' },
    { x: 0.82, y: 0.36, r: 0.45, c: 'rgba(255,246,236,0.5)' },
    { x: 0.35, y: 0.88, r: 0.5, c: 'rgba(255,225,225,0.45)' },
  ]
  for (const b of blobs) {
    const rg = ctx.createRadialGradient(
      cssW * b.x,
      cssH * b.y,
      0,
      cssW * b.x,
      cssH * b.y,
      Math.max(cssW, cssH) * b.r,
    )
    rg.addColorStop(0, b.c)
    rg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = rg
    ctx.fillRect(0, 0, cssW, cssH)
  }

  // 提示文案直接画在遮罩上：刮着刮着字就被抹掉了，很有仪式感
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = cssW / 2
  const cy = cssH / 2

  ctx.fillStyle = 'rgba(122, 84, 96, 0.62)'
  ctx.font = `600 ${Math.round(cssW * 0.062)}px -apple-system, "PingFang SC", sans-serif`
  ctx.fillText(copy.tip, cx, cy - Math.round(cssW * 0.028))

  ctx.fillStyle = 'rgba(122, 84, 96, 0.4)'
  ctx.font = `400 ${Math.round(cssW * 0.044)}px -apple-system, "PingFang SC", sans-serif`
  ctx.fillText(copy.hint, cx, cy + Math.round(cssW * 0.055))

  // 小装饰：几个圆点 + 一颗心
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  const dots = [
    [0.16, 0.14, 3],
    [0.86, 0.12, 1.8],
    [0.12, 0.8, 2.2],
    [0.9, 0.84, 2.6],
    [0.5, 0.16, 1.6],
    [0.74, 0.9, 2],
  ]
  for (const [dx, dy, r] of dots) {
    ctx.beginPath()
    ctx.arc(cssW * dx, cssH * dy, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/* ========================================================================== */
/*  2. 刮擦                                                                   */
/* ========================================================================== */

/** 把事件坐标换算成 canvas 的内部 CSS 像素坐标 */
function getPoint(e) {
  const rect = canvasEl.value.getBoundingClientRect()
  let clientX
  let clientY
  if (e.touches && e.touches.length) {
    clientX = e.touches[0].clientX
    clientY = e.touches[0].clientY
  } else if (e.changedTouches && e.changedTouches.length) {
    // touchend / touchcancel 里 touches 已经空了，点位在 changedTouches
    clientX = e.changedTouches[0].clientX
    clientY = e.changedTouches[0].clientY
  } else {
    clientX = e.clientX
    clientY = e.clientY
  }
  return { x: clientX - rect.left, y: clientY - rect.top }
}

/** 在一点盖一个「软笔刷」章 —— 这就是擦除的最小单位 */
function stamp(x, y) {
  const g = ctx.createRadialGradient(x, y, BRUSH * 0.12, x, y, BRUSH)
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.5, 'rgba(0,0,0,0.94)')
  g.addColorStop(0.78, 'rgba(0,0,0,0.55)')
  g.addColorStop(1, 'rgba(0,0,0,0)')

  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, BRUSH, 0, Math.PI * 2)
  ctx.fill()
}

/** 两点之间插值补点，避免快速滑动出现虚线 */
function stroke(from, to) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  // 步长取笔刷半径的 1/3：既不会留缝，也不会盖章盖到卡
  const stepLen = Math.max(4, BRUSH * 0.32)
  const steps = Math.max(1, Math.ceil(dist / stepLen))
  for (let i = 1; i <= steps; i++) {
    stamp(from.x + (dx * i) / steps, from.y + (dy * i) / steps)
  }
}

function onStart(e) {
  if (revealed.value) return
  drawing = true
  last = getPoint(e)
  stamp(last.x, last.y)
}

function onMove(e) {
  if (!drawing || revealed.value) return
  const p = getPoint(e)
  if (last) stroke(last, p)
  else stamp(p.x, p.y)
  last = p
  checkProgress(false)
}

function onEnd() {
  if (!drawing) return
  drawing = false
  last = null
  // 抬手时一定算一次，保证进度准确
  checkProgress(true)
}

/* ========================================================================== */
/*  3. 进度检测                                                               */
/* ========================================================================== */
/**
 * 统计 alpha < 128（= 被擦掉）的像素占比。
 * getImageData 会同步回读整块画布，是这条链路上最重的操作，
 * 所以：① 每 200ms 最多一次 ② 采样步长 6 个设备像素（不是逐像素）
 */
function checkProgress(force) {
  if (!ctx || revealed.value) return
  const now = performance.now()
  if (!force && now - lastCheck < 200) return
  lastCheck = now

  const canvas = canvasEl.value
  const w = canvas.width
  const h = canvas.height
  let data
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return // 极少数内核会因画布污染抛错，直接放弃进度检测
  }

  const STEP = 6
  let clear = 0
  let total = 0
  for (let y = 0; y < h; y += STEP) {
    const rowBase = y * w
    for (let x = 0; x < w; x += STEP) {
      total++
      if (data[(rowBase + x) * 4 + 3] < 128) clear++
    }
  }
  if (!total) return

  const ratio = clear / total
  progress.value = ratio
  if (ratio >= REVEAL_RATIO) reveal()
}

function reveal() {
  if (revealed.value) return
  revealed.value = true
  vibrate(18)
  // 一串上行的五声音阶：刮开的那一下要有「揭晓」的仪式感
  sfx.reveal()
}

/* ========================================================================== */
/*  4. 生命周期                                                               */
/* ========================================================================== */
let orientationHandler = null

onMounted(async () => {
  await nextTick()
  // 等一帧，确保屏间过渡里的布局已经算完（否则拿到 0 宽度）
  rafId = requestAnimationFrame(setupCanvas)

  orientationHandler = () => {
    // 转屏后画布会拉伸 → 重开一张遮罩（进度归零，属于可接受的取舍）
    if (revealed.value) return
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(setupCanvas)
  }
  window.addEventListener('orientationchange', orientationHandler)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  if (orientationHandler) window.removeEventListener('orientationchange', orientationHandler)
  ctx = null
})
</script>

<template>
  <section class="screen scratch-screen">
    <header class="lv-head">
      <p class="lv-kicker">{{ copy.kicker }}</p>
      <h2 class="lv-title">{{ copy.title }}</h2>
      <p class="lv-sub">{{ revealed ? copy.caption : '雾下面藏着我们的第一张照片' }}</p>
    </header>

    <!-- 舞台：照片 + 遮罩画布，尺寸同相框一样受 --app-h 约束 -->
    <div class="scratch-wrap">
      <div ref="stageEl" class="scratch-stage">
        <!-- 揭晓后照片极缓慢地推近（Ken Burns），静的东西有了呼吸 -->
        <img class="scratch-photo" :class="{ 'is-revealed': revealed }" :src="photo" alt="我们的照片" />
        <span class="grain" aria-hidden="true"></span>
        <canvas
          ref="canvasEl"
          class="scratch-canvas"
          :class="{ 'is-gone': revealed }"
          aria-label="用手指在照片上刮一刮，揭开下面的照片"
          @touchstart.prevent="onStart"
          @touchmove.prevent="onMove"
          @touchend="onEnd"
          @touchcancel="onEnd"
          @mousedown.prevent="onStart"
          @mousemove="onMove"
          @mouseup="onEnd"
          @mouseleave="onEnd"
        ></canvas>
      </div>
    </div>

    <footer class="thumb-bar">
      <GlassButton v-if="revealed" block @click="emit('done')">{{ copy.continue }}</GlassButton>
      <p v-else class="t-hint">上面那层雾，刮开它</p>
    </footer>
  </section>
</template>

<style scoped>
.scratch-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0;
}

.scratch-stage {
  position: relative;
  width: min(88vw, 340px);
  /* 第四个约束：保证矮屏上底部按钮不被挤出屏幕（--app-h 是 JS 实测的真实高度） */
  width: min(88vw, 340px, calc((var(--app-h) - 300px) * 0.8));
  aspect-ratio: 4 / 5;
  border-radius: 26px;
  overflow: hidden;
  background: #f6e6e2;
  box-shadow: 0 14px 34px rgba(170, 110, 130, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.scratch-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  will-change: transform;
}
/* 揭晓后缓慢推近 6%：18 秒走完，几乎察觉不到，但照片「活了」 */
.scratch-photo.is-revealed {
  animation: kenburns 18s ease-out forwards;
}

@keyframes kenburns {
  from {
    transform: scale(1) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.06) translate3d(-1%, -1.5%, 0);
  }
}

.scratch-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  /* 关键：告诉浏览器这块区域的手势我们自己处理，
     否则手指一滑页面就跟着滚（微信里表现为整页上下弹） */
  touch-action: none;
  transition: opacity 0.45s ease;
}
.scratch-canvas.is-gone {
  opacity: 0;
  pointer-events: none;
}
</style>
