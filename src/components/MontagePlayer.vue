<script setup>
/**
 * ============================================================================
 *  MontagePlayer —— 20 张照片的「伪视频」卡点回忆录（抖音图文那种）
 *  ---------------------------------------------------------------------------
 *  用法：
 *    <MontagePlayer
 *      :photos="base64List"        // 20 张 base64（dataURL）或普通 URL
 *      :lines="captionList"        // 和 photos 一一对应的字幕，可留空
 *      :slot-ms="1500"             // 每张停留时长
 *      @ended="onEnded"            // 播完 / 点跳过时触发，父组件去撒花
 *    />
 *
 *  三条必须守住的设计：
 *    1. 【DOM 里永远只有 2 个 <img>】
 *       20 张 base64 如果都挂到 DOM 上，浏览器会为每张都保留一份解码后的位图
 *       （800×1200 JPEG 解码后约 3.7MB/张，20 张就是 70MB+），iOS Safari 极易
 *       被杀进程。所以这里用 A/B 两个槽位交替复用：换图只是改 src，元素不重建。
 *    2. 【换图前必须先解码】
 *       直接换 src 再淡入，淡入过程里浏览器可能还在解码，会看到一闪而过的黑/白。
 *       所以先 new Image() 把下一张 decode() 完，再开始交叉淡化。
 *    3. 【交叉淡化靠 opacity 过渡，运镜靠 animation-name 变化】
 *       两个槽各自 `opacity: 0 → 1` 过渡就是无缝交叉；
 *       而运镜不用重新挂载节点，只切换 animation-name（kb-zoom / kb-pan-l …），
 *       CSS 动画会因为「动画名变了」而自动从头播 —— 这是最省的重启动画方式。
 * ========================================================================== */
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

const props = defineProps({
  /** 照片数组：base64 dataURL 或 http URL */
  photos: { type: Array, required: true },
  /** 字幕数组，与 photos 一一对应；缺省则不显示歌词条 */
  lines: { type: Array, default: () => [] },
  /** 每张照片停留时长（毫秒） */
  slotMs: { type: Number, default: 1500 },
  /** 交叉淡化时长（毫秒） */
  fadeMs: { type: Number, default: 600 },
  /** 顶部抖音式分段进度条 */
  progress: { type: Boolean, default: true },
  /** 挂载后是否自动播放 */
  autoplay: { type: Boolean, default: true },
})

const emit = defineEmits(['ended', 'change'])

/** 六套运镜，按下标交替使用（同一槽位两次使用之间必然不同名 → 动画必然重启） */
const KB_NAMES = ['kb-zoom', 'kb-pan-l', 'kb-pan-r', 'kb-rise', 'kb-tilt-l', 'kb-tilt-r']
/** 三套歌词浮现动画，同理交替 */
const CAP_NAMES = ['cap-rise-1', 'cap-rise-2', 'cap-rise-3']

/* ---------------------------------------------------------------- 播放状态 */
const index = ref(0)
const caption = ref('')
const capAnim = ref('')
const finished = ref(false)
const paused = ref(false)
/** 重播时 +1，用来让顶部进度条整组重建（动画从 0 开始） */
const generation = ref(0)
/** 控制条默认隐藏，点一下屏幕才浮出来 3 秒 */
const controlsShown = ref(false)

/**
 * 两个槽位（永远只有这两个 DOM 节点）
 *   src      当前这个槽装的是哪张图
 *   visible  是不是「前台」那一层（true = opacity 1）
 *   kb       运镜动画名，空串表示不播
 */
const slots = reactive([
  { src: '', visible: false, kb: '' },
  { src: '', visible: false, kb: '' },
])
/** 当前前台槽的下标；-1 表示还没有任何一层在前台 */
let frontSlot = -1
/** 防止解码慢时两次 tick 撞车 */
let busy = false

/** 已解码过的图片，避免同一张重复解码 */
const decoded = new Set()

/* ---------------------------------------------------------------- CSS 变量 */
const cssVars = computed(() => ({
  '--slot-ms': `${props.slotMs}ms`,
  '--fade-ms': `${props.fadeMs}ms`,
}))

/* ========================================================================== */
/*  工具                                                                      */
/* ========================================================================== */

/**
 * 等两帧。
 * 为什么是两帧：改完数据后 Vue 会在微任务里更新 DOM，但那只是「改了样式」，
 * 浏览器还没把它画出来。要等真正的渲染帧过去（第一帧），再等一帧，
 * 之后挂上 opacity:1 的类，transition 才会从 0 开始跑，否则会被合并成「直接就位」。
 */
function nextFrame() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

/**
 * 预解码一张图
 * 不预解码直接切 src：iOS 上大图解码是同步占用主线程的，
 * 淡入的一瞬间正好在解码 → 掉帧 + 闪一下黑。
 */
function decodeImage(src) {
  if (!src) return Promise.resolve()
  if (decoded.has(src)) return Promise.resolve()

  return new Promise((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      decoded.add(src)
      resolve()
    }

    const img = new Image()
    img.decoding = 'async'
    img.onload = finish
    img.onerror = finish // 坏图也不能卡住播放
    img.src = src

    // 能 decode() 就更彻底：等到「可以直接上屏」才返回
    if (typeof img.decode === 'function') {
      img.decode().then(finish).catch(finish)
    }
    // 兜底：极端情况下解码迟迟不结束，也不能把整个播放卡死
    setTimeout(finish, 3000)
  })
}

/** 预取下一张，让真正的切换不需要等待 */
function preloadNext(at) {
  const next = props.photos[at + 1]
  if (next) decodeImage(next)
}

/* ========================================================================== */
/*  核心：切换到第 i 张（双层交替）                                            */
/* ========================================================================== */
async function show(i) {
  const total = props.photos.length
  if (!total) return

  const safeIndex = Math.max(0, Math.min(total - 1, i))

  // ① 选出「没在前台」的那个槽作为下一张的容器 → A/B 交替
  const nextFront = frontSlot === 0 ? 1 : 0
  const slot = slots[nextFront]
  const prevFront = frontSlot >= 0 ? slots[frontSlot] : null

  busy = true

  // ② 先摘掉这个槽上的运镜动画名：如果留着上一轮的动画，
  //    新图一进来就会从「上次播到一半的进度」继续，缩放会跳一下
  slot.kb = ''

  // ③ 换图。此刻这个槽的 opacity 还是 0，用户看不到「换图」这一瞬间
  slot.src = props.photos[safeIndex]

  // ④ 关键：等解码完再淡入，否则淡入的是一张还没解码的空图
  await decodeImage(slot.src)

  // ⑤ 等两帧，确保上一步的「opacity: 0」已经真的画到屏幕上
  await nextFrame()

  // ⑥ 换运镜并推到前台：animation-name 变了 → 动画自动从头播；
  //    同时另一个槽 opacity 归 0，两个槽的 opacity 过渡叠在一起就是交叉淡化
  slot.kb = KB_NAMES[safeIndex % KB_NAMES.length]
  slot.visible = true
  if (prevFront) prevFront.visible = false
  frontSlot = nextFront

  // ⑦ 歌词
  caption.value = props.lines[safeIndex] || ''
  if (caption.value) capAnim.value = CAP_NAMES[safeIndex % CAP_NAMES.length]

  index.value = safeIndex
  emit('change', safeIndex)
  busy = false
}

/* ========================================================================== */
/*  播放时钟                                                                  */
/* ========================================================================== */
let timer = 0
let startedAt = 0

/** 排下一次 tick */
function schedule(delay = props.slotMs) {
  clearTimeout(timer)
  if (paused.value || finished.value) return
  startedAt = performance.now()
  timer = window.setTimeout(tick, delay)
}

function tick() {
  if (finished.value || paused.value) return
  // 上一次切换还卡在解码里（大图 / 慢设备）→ 隔 80ms 再试，
  // 否则同一时刻会有两次 show() 在抢同一个槽位，画面会跳
  if (busy) {
    timer = window.setTimeout(tick, 80)
    return
  }
  // 已经是最后一张 → 再停一个 slotMs 就结束（保证 20 × 1.5s ≈ 30s）
  if (index.value >= props.photos.length - 1) {
    finish()
    return
  }
  show(index.value + 1)
  preloadNext(index.value)
  schedule()
}

function finish() {
  if (finished.value) return
  finished.value = true
  clearTimeout(timer)
  controlsShown.value = true // 结束时把控制条露出来，方便她重播
  emit('ended')
}

/* ========================================================================== */
/*  对外方法                                                                  */
/* ========================================================================== */
function replay() {
  clearTimeout(timer)
  finished.value = false
  paused.value = false
  busy = false

  // 两层都退回幕后（instant，不要过渡，否则是慢慢黑下去）
  slots.forEach((s) => {
    s.visible = false
    s.kb = ''
  })
  frontSlot = -1
  index.value = 0
  caption.value = ''
  // 进度条整组重建 → 动画从 0 开始
  generation.value += 1

  nextTick().then(async () => {
    await show(0)
    preloadNext(0)
    schedule()
  })
}

/** 跳过：直接进入结局（父组件收到 ended 去撒花） */
function skip() {
  finish()
}

/** 暂停（切后台 / 父组件收起到后台时调用） */
function pause() {
  if (paused.value || finished.value) return
  paused.value = true
  clearTimeout(timer)
}

/** 继续播放 */
function resume() {
  if (!paused.value || finished.value) return
  paused.value = false
  // 剩余时间为负（已经超时）就立刻切
  const elapsed = performance.now() - startedAt
  schedule(Math.max(0, props.slotMs - elapsed))
}

/** 点一下屏幕：控制条浮出来，3 秒后自己淡回去 */
let hideTimer = 0
function revealControls() {
  controlsShown.value = true
  clearTimeout(hideTimer)
  hideTimer = window.setTimeout(() => {
    if (!finished.value) controlsShown.value = false
  }, 3200)
}

defineExpose({ replay, skip, pause, resume })

/* ========================================================================== */
/*  生命周期                                                                  */
/* ========================================================================== */
function onVisibilityChange() {
  if (document.hidden) pause()
  else resume()
}

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (!props.photos.length) {
    // 没图也要给父组件一个交代，别让它永远等 ended
    finish()
    return
  }

  await show(0)
  preloadNext(0)
  if (props.autoplay) schedule()
})

// 父组件换了一批照片（比如重新编辑后重播）→ 从头来
watch(
  () => props.photos,
  () => {
    if (props.photos.length) replay()
  },
)

onBeforeUnmount(() => {
  clearTimeout(timer)
  clearTimeout(hideTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)

  // 主动释放解码位图。
  // 只把元素从 DOM 里摘掉，浏览器什么时候回收那几十 MB 是不确定的；
  // 把 src 清空再配合 VDOM 移除，内存能更早落下去（这是这段代码里最容易被忽略的一步）。
  slots.forEach((s) => {
    s.visible = false
    s.kb = ''
    s.src = ''
  })
  decoded.clear()
})
</script>

<template>
  <div
    class="montage"
    :class="{ 'is-paused': paused, 'is-finished': finished }"
    :style="cssVars"
    role="region"
    aria-label="回忆录播放"
    @pointerdown="revealControls"
  >
    <!-- ===================== 顶部抖音式分段进度 ===================== -->
    <div v-if="progress && photos.length" :key="generation" class="progress" aria-hidden="true">
      <span
        v-for="(_, i) in photos"
        :key="i"
        class="seg"
        :class="{ 'is-done': i < index, 'is-active': i === index }"
      >
        <i class="seg-fill"></i>
      </span>
    </div>

    <!-- ===================== 双层交替的图片舞台 ===================== -->
    <div class="stage">
      <!--
        只有两个 .slot。is-front 的那层 opacity: 1 并播运镜；
        另一层 opacity: 0 负责把上一张淡出。两层的 opacity 过渡叠加 = 交叉淡化。
      -->
      <div v-for="(s, i) in slots" :key="i" class="slot" :class="{ 'is-front': s.visible }">
        <img
          v-if="s.src"
          class="photo"
          :class="s.kb"
          :src="s.src"
          alt=""
          draggable="false"
          decoding="async"
        />
      </div>

      <!-- 电影感：暗角 + 上下渐变压暗（让字幕和进度条可读） -->
      <div class="vignette" aria-hidden="true"></div>
      <div class="scrim scrim--top" aria-hidden="true"></div>
      <div class="scrim scrim--bottom" aria-hidden="true"></div>
    </div>

    <!-- ===================== 液态玻璃歌词 ===================== -->
    <div v-show="caption" class="lyric-wrap">
      <!--
        不重建 DOM：改文字 + 换 animation-name（cap-rise-1/2/3），
        CSS 动画就会从头播一次，得到「轻微上浮 + 淡入」的效果。
      -->
      <p class="lyric" :class="capAnim">{{ caption }}</p>
    </div>

    <!-- ===================== 隐藏的控制条（点一下屏幕才出现） ===================== -->
    <div class="controls" :class="{ 'is-shown': controlsShown }">
      <button v-if="!finished" type="button" class="ghost-btn" @click.stop="skip">
        跳过
      </button>
      <button v-else type="button" class="ghost-btn" @click.stop="replay">重播</button>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   容器
   ========================================================================== */
.montage {
  position: fixed;
  inset: 0;
  /* 手机上 100dvh 才是「真正能看到的可视高度」（地址栏伸缩会改变它），
     用 100vh 会让底部字幕被地址栏吃掉 */
  height: 100%;
  height: 100dvh;
  overflow: hidden;
  background: #07070a;
  /* 全屏播放器：禁止页面跟着手指滚动 / 微信下拉回弹 */
  overscroll-behavior: none;
  touch-action: none;
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  isolation: isolate;
}

/* ==========================================================================
   舞台与双层槽位
   ========================================================================== */
.stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #000;
}

.slot {
  position: absolute;
  inset: 0;
  opacity: 0;
  /* 交叉淡化的本体：只有 opacity 在过渡，不做任何 layout 变化 */
  transition: opacity var(--fade-ms) cubic-bezier(0.4, 0, 0.2, 1);
  /* 提示 GPU 把这层单独合成，过渡期间不参与重排 */
  will-change: opacity;
  backface-visibility: hidden;
}

.slot.is-front {
  opacity: 1;
}

.photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* cover：不拉伸变形，多余部分裁掉（配合上面的运镜放大刚好） */
  object-fit: cover;
  /* 关键性能声明：告诉浏览器「我只会改 transform」，提前提升为合成层 */
  will-change: transform;
  transform: translateZ(0);
  backface-visibility: hidden;
  /* 手机端：不允许长按保存/拖拽这张图 */
  -webkit-user-drag: none;
  user-select: none;
}

/* ==========================================================================
   六套 Ken Burns 运镜
   ---------------------------------------------------------------------------
   设计原则：
     · 全部只改 transform（GPU 合成，零重排）
     · 时长 = 停留 + 淡化，这样交叉淡化的那 600ms 里画面还在继续推，不会「停下来」
     · transform-origin 参与构图：pan 用偏侧的 origin，让放大方向有指向性
     · 所有起始 scale ≥ 1.08（rotate / translate 会露边，必须留余量）
   ========================================================================== */
.photo.kb-zoom,
.photo.kb-pan-l,
.photo.kb-pan-r,
.photo.kb-rise,
.photo.kb-tilt-l,
.photo.kb-tilt-r {
  /* --kb-ms 在下面统一用 calc 定义，保证「停留 + 淡化」期间动画不停 */
  animation-duration: calc(var(--slot-ms) + var(--fade-ms));
  animation-timing-function: linear;
  animation-fill-mode: forwards;
  animation-iteration-count: 1;
}

/* 1. 正面缓推：最稳的一条，用作基准 */
.kb-zoom {
  animation-name: kb-zoom;
  transform-origin: 50% 48%;
}

/* 2. 向左横移（镜头跟着人往左摇）：origin 偏右，放大会感觉向右展开 */
.kb-pan-l {
  animation-name: kb-pan-l;
  transform-origin: 62% 50%;
}

/* 3. 向右横移 */
.kb-pan-r {
  animation-name: kb-pan-r;
  transform-origin: 38% 50%;
}

/* 4. 向上缓推（像抬头看） */
.kb-rise {
  animation-name: kb-rise;
  transform-origin: 50% 62%;
}

/* 5. / 6. 极轻微的手持倾斜感（±0.9°，再大就晕了） */
.kb-tilt-l {
  animation-name: kb-tilt-l;
  transform-origin: 48% 50%;
}
.kb-tilt-r {
  animation-name: kb-tilt-r;
  transform-origin: 52% 50%;
}

@keyframes kb-zoom {
  from {
    transform: scale(1) translateZ(0);
  }
  to {
    transform: scale(1.1) translateZ(0);
  }
}

@keyframes kb-pan-l {
  from {
    transform: scale(1.08) translate3d(2%, 0, 0);
  }
  to {
    transform: scale(1.15) translate3d(-2%, 0, 0);
  }
}

@keyframes kb-pan-r {
  from {
    transform: scale(1.08) translate3d(-2%, 0, 0);
  }
  to {
    transform: scale(1.15) translate3d(2%, 0, 0);
  }
}

@keyframes kb-rise {
  from {
    transform: scale(1.08) translate3d(0, 2%, 0);
  }
  to {
    transform: scale(1.15) translate3d(0, -2%, 0);
  }
}

@keyframes kb-tilt-l {
  from {
    transform: scale(1.1) rotate(-0.9deg);
  }
  to {
    transform: scale(1.16) rotate(0.5deg);
  }
}

@keyframes kb-tilt-r {
  from {
    transform: scale(1.1) rotate(0.9deg);
  }
  to {
    transform: scale(1.16) rotate(-0.5deg);
  }
}

/* ==========================================================================
   电影感叠层
   ========================================================================== */
.vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(125% 92% at 50% 45%, transparent 42%, rgba(0, 0, 0, 0.42) 100%);
}

.scrim {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}
.scrim--top {
  top: 0;
  height: 130px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.62), transparent);
}
.scrim--bottom {
  bottom: 0;
  height: 48%;
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.74), rgba(0, 0, 0, 0.24) 44%, transparent);
}

/* ==========================================================================
   顶部进度（抖音那条）
   ========================================================================== */
.progress {
  position: absolute;
  z-index: 5;
  top: calc(env(safe-area-inset-top, 0px) + 9px);
  left: 11px;
  right: 11px;
  display: flex;
  gap: 3px;
  pointer-events: none;
}

.seg {
  flex: 1 1 0;
  height: 2.5px;
  border-radius: 2px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.24);
}

.seg-fill {
  display: block;
  height: 100%;
  width: 100%;
  background: rgba(255, 255, 255, 0.95);
  /* 用 scaleX 而不是 width：scale 走合成器，不触发重排 */
  transform: scaleX(0);
  transform-origin: left center;
}

.seg.is-done .seg-fill {
  transform: scaleX(1);
}

.seg.is-active .seg-fill {
  animation: seg-fill var(--slot-ms) linear forwards;
}

@keyframes seg-fill {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* 暂停时进度也停住 */
.montage.is-paused .seg.is-active .seg-fill {
  animation-play-state: paused;
}

/* ==========================================================================
   液态玻璃歌词
   ========================================================================== */
.lyric-wrap {
  position: absolute;
  z-index: 4;
  left: 0;
  right: 0;
  bottom: calc(13% + env(safe-area-inset-bottom, 0px));
  display: flex;
  justify-content: center;
  padding: 0 22px;
  pointer-events: none;
}

.lyric {
  max-width: 88%;
  margin: 0;
  padding: 12px 20px;
  border-radius: 18px;
  /* 毛玻璃：blur 控制在 14px（再大在安卓 X5 上明显掉帧） */
  background: rgba(255, 255, 255, 0.13);
  border: 1px solid rgba(255, 255, 255, 0.22);
  -webkit-backdrop-filter: blur(14px) saturate(160%);
  backdrop-filter: blur(14px) saturate(160%);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.28);
  /* 电影字幕感：衬线 + 白色 + 一圈暗光，压在任何照片上都读得清 */
  font-family: 'Songti SC', 'STSong', 'Noto Serif CJK SC', serif;
  font-size: clamp(15px, 4.4vw, 19px);
  line-height: 1.55;
  letter-spacing: 0.5px;
  color: #fff;
  text-align: center;
  text-shadow: 0 1px 14px rgba(0, 0, 0, 0.55);
  /* 只动 transform / opacity */
  will-change: transform, opacity;
}

/* 三套浮现，交替使用（换 animation-name 就会从头播） */
.cap-rise-1,
.cap-rise-2,
.cap-rise-3 {
  animation-duration: 0.58s;
  animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
  animation-fill-mode: both;
}
.cap-rise-1 {
  animation-name: cap-rise-1;
}
.cap-rise-2 {
  animation-name: cap-rise-2;
}
.cap-rise-3 {
  animation-name: cap-rise-3;
}

@keyframes cap-rise-1 {
  from {
    opacity: 0;
    transform: translate3d(0, 20px, 0) scale(0.96);
  }
  60% {
    opacity: 1;
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes cap-rise-2 {
  from {
    opacity: 0;
    transform: translate3d(0, 26px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@keyframes cap-rise-3 {
  from {
    opacity: 0;
    transform: translate3d(0, 15px, 0) scale(1.02);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

/* ==========================================================================
   隐藏控制条
   ========================================================================== */
.controls {
  position: absolute;
  z-index: 6;
  right: calc(14px + env(safe-area-inset-right, 0px));
  bottom: calc(14px + env(safe-area-inset-bottom, 0px));
  opacity: 0;
  transform: translate3d(0, 6px, 0);
  transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
  /* 隐藏时别挡住手势 */
  pointer-events: none;
}

.controls.is-shown {
  opacity: 1;
  transform: none;
  pointer-events: auto;
}

.ghost-btn {
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.72);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.16);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  transition: transform 0.16s ease, color 0.2s ease;
}

.ghost-btn:active {
  transform: scale(0.94);
  color: #fff;
}

/* ==========================================================================
   减少动态效果：只保留交叉淡化，去掉运镜与上浮位移
   ========================================================================== */
@media (prefers-reduced-motion: reduce) {
  .photo.kb-zoom,
  .photo.kb-pan-l,
  .photo.kb-pan-r,
  .photo.kb-rise,
  .photo.kb-tilt-l,
  .photo.kb-tilt-r {
    animation: none;
    transform: scale(1.02);
  }
  .cap-rise-1,
  .cap-rise-2,
  .cap-rise-3 {
    animation-name: cap-fade;
    animation-duration: 0.3s;
  }
  @keyframes cap-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
}
</style>
