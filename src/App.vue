<script setup>
/**
 * ============================================================================
 *  我们的恋爱回忆录 —— 根组件（状态机 + 全局背景 + 屏间调度 + 全局服务）
 *  ---------------------------------------------------------------------------
 *  状态机：
 *    upload  开场，还没放照片
 *    start   照片已就位（含刷新后从 localStorage 恢复），等用户点「开启回忆」
 *    level1  点亮星星（点亮成一颗心）
 *    level2  刮刮乐
 *    level3  默契挑战
 *    ending  结局（星空 + 打字机 + 贴贴 + 彩蛋）
 *
 *  通关明信片不是独立状态，而是 level3 通关后盖在页面上的弹层。
 *
 *  这里有三个「全局服务」，各自只做一件事：
 *    · useViewportHeight  —— 把真实视口高度写进 CSS 变量（治手机地址栏吃高度）
 *    · audio/sound        —— 背景音乐与音效（第一次触摸时解锁）
 *    · storage            —— 照片 / 进度 / 声音偏好，刷新不丢
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount, onErrorCaptured } from 'vue'

import { CONFIG } from './config.js'
import { useViewportHeight } from './composables/useViewport.js'
import { loadPhoto, saveProgress, loadProgress, clearProgress, clearAll } from './utils/storage.js'
import { warnConfigIssues } from './utils/validateConfig.js'
import { unlock, startMusic, stopMusic } from './audio/sound.js'

import UploadFrame from './components/UploadFrame.vue'
import StarLevel from './components/StarLevel.vue'
import ScratchLevel from './components/ScratchLevel.vue'
import QuizLevel from './components/QuizLevel.vue'
import PostcardModal from './components/PostcardModal.vue'
import EndingScene from './components/EndingScene.vue'
import ToastHost from './components/ToastHost.vue'
import SoundToggle from './components/SoundToggle.vue'
import RotateTip from './components/RotateTip.vue'
import GlassButton from './components/GlassButton.vue'

/** 状态枚举（Object.freeze 防止手滑改掉） */
const PHASE = Object.freeze({
  UPLOAD: 'upload',
  START: 'start',
  LEVEL1: 'level1',
  LEVEL2: 'level2',
  LEVEL3: 'level3',
  ENDING: 'ending',
})

const ui = CONFIG.ui

const currentState = ref(PHASE.UPLOAD)
/** 我们的照片（dataURL），一路传到相框 / 刮刮乐 / 明信片 / 海报 */
const photo = ref(null)
/** 通关明信片弹层 */
const postcardOpen = ref(false)
/** 万一渲染出错，展示一个友好的兜底页而不是白屏 */
const errorMsg = ref('')

/* 真实视口高度 → CSS 变量 --app-h */
useViewportHeight()

const isUploadPhase = computed(
  () => currentState.value === PHASE.UPLOAD || currentState.value === PHASE.START,
)
/** 当前在第几关（0 = 不在关卡里），用于顶部三个进度点 */
const levelIndex = computed(() => {
  const map = { [PHASE.LEVEL1]: 1, [PHASE.LEVEL2]: 2, [PHASE.LEVEL3]: 3 }
  return map[currentState.value] || 0
})
const showDots = computed(() => levelIndex.value > 0)
const isNight = computed(() => currentState.value === PHASE.ENDING)

/** 这一屏该配哪种音乐情绪；null = 不该有音乐 */
function musicFor(state) {
  if (state === PHASE.LEVEL1 || state === PHASE.LEVEL2 || state === PHASE.LEVEL3) return 'game'
  if (state === PHASE.ENDING) return 'ending'
  return null
}

/**
 * 切屏（唯一入口，方便顺手处理「存档 + 音乐」）
 * @param {string} state 目标状态
 * @param {object} opt persist: 是否写入进度
 */
function go(state, opt = {}) {
  const { persist = true } = opt
  if (currentState.value === state) return
  currentState.value = state

  const mood = musicFor(state)
  if (mood) {
    if (persist) saveProgress(state)
    startMusic(mood)
  } else {
    clearProgress()
    stopMusic()
  }
}

/* ---------------------------------------------------------------- 事件链 */

/** 选好照片（UploadFrame 已经压缩 + 存好 localStorage） */
function onPicked(dataURL) {
  photo.value = dataURL
  // 换照片 = 重新开始，旧进度作废
  clearProgress()
  // upload → start：同一个组件实例，不触发屏间过渡，
  // 照片自己带「掉进相框」的弹簧动画
  currentState.value = PHASE.START
}

/** 第三关打完 → 弹明信片 */
function onQuizDone() {
  postcardOpen.value = true
}

/** 收下明信片 → 等弹层收起的动画走一半，再切到结局画面 */
function onPostcardAccept() {
  postcardOpen.value = false
  setTimeout(() => go(PHASE.ENDING), 260)
}

/** 结局里点「再看一遍」：清掉照片和进度，回到开场 */
function onRestart() {
  clearAll()
  photo.value = null
  postcardOpen.value = false
  errorMsg.value = ''
  stopMusic()
  currentState.value = PHASE.UPLOAD
}

function reloadPage() {
  try {
    window.location.reload()
  } catch {
    /* 忽略 */
  }
}

/* ------------------------------------------------------------ 错误兜底 */
/**
 * 任何一个子组件渲染/生命周期抛错，都在这里兜住：
 * 与其给她一个白屏，不如给一张卡片和「刷新一下」。
 * 返回 false 阻止错误继续向上冒泡（避免整棵树被卸载成空白）。
 */
onErrorCaptured((err, _instance, info) => {
  console.error('[love-memoir] 渲染异常：', info, err)
  errorMsg.value = String((err && err.message) || err || 'UNKNOWN')
  return false
})

/* -------------------------------------------------------------- 生命周期 */
let firstPointer = null

onMounted(() => {
  // config 自检：改错字段只在控制台提醒，绝不影响她玩
  warnConfigIssues(CONFIG)

  // 1) iOS/微信 要求音频在用户手势里解锁 —— 全局挂一次，点到哪都算
  firstPointer = () => unlock()
  document.addEventListener('pointerdown', firstPointer, { passive: true, once: true })

  // 2) 调试小后门（README 有说明）。
  //    注意必须放在「没有照片就 return」之前 —— 否则新访客（相册还是空的）
  //    在控制台里根本拿不到这个对象，调试第一关时会被坑。
  window.__loveMemoir__ = {
    goto: (state) => go(state),
    getState: () => currentState.value,
    getPhoto: () => !!photo.value,
    restart: onRestart,
    reset: onRestart,
  }

  // 3) 恢复现场：照片 + 上次玩到哪一关
  const savedPhoto = loadPhoto()
  if (!savedPhoto) return
  photo.value = savedPhoto

  const stage = loadProgress()
  if (stage) {
    currentState.value = stage
    // 先把「想听音乐」记上，真正出声要等第一次触摸解锁
    const mood = musicFor(stage)
    if (mood) startMusic(mood)
  } else {
    currentState.value = PHASE.START
  }
})

onBeforeUnmount(() => {
  if (firstPointer) document.removeEventListener('pointerdown', firstPointer)
  delete window.__loveMemoir__
})
</script>

<template>
  <div class="app" :class="{ 'is-night': isNight }">
    <!-- ================= 全局背景：香槟金 → 冷玫瑰，结局过渡到星空 ================= -->
    <div class="bg" aria-hidden="true">
      <div class="bg-base"></div>
      <span class="bg-orb bg-orb--1"></span>
      <span class="bg-orb bg-orb--2"></span>
      <span class="bg-orb bg-orb--3"></span>
      <!-- 夜幕层：结局时淡入，盖住前面的暖色光球 -->
      <div class="bg-night" :class="{ 'is-on': isNight }"></div>
    </div>

    <!-- 右上角声音开关（第一屏就能看到，方便她随时静音） -->
    <SoundToggle v-if="!errorMsg" :config="CONFIG" />

    <!-- ================================= 主舞台 ================================= -->
    <main class="stage">
      <Transition name="screen" mode="out-in">
        <UploadFrame
          v-if="isUploadPhase"
          key="upload"
          :photo="photo"
          :config="CONFIG"
          @picked="onPicked"
          @start="go(PHASE.LEVEL1)"
        />

        <StarLevel
          v-else-if="currentState === PHASE.LEVEL1"
          key="level1"
          :config="CONFIG"
          @done="go(PHASE.LEVEL2)"
        />

        <ScratchLevel
          v-else-if="currentState === PHASE.LEVEL2"
          key="level2"
          :photo="photo"
          :config="CONFIG"
          @done="go(PHASE.LEVEL3)"
        />

        <QuizLevel
          v-else-if="currentState === PHASE.LEVEL3"
          key="level3"
          :config="CONFIG"
          @done="onQuizDone"
        />

        <EndingScene
          v-else-if="currentState === PHASE.ENDING"
          key="ending"
          :config="CONFIG"
          @restart="onRestart"
        />
      </Transition>

      <!-- 关卡进度点（只在三关里显示） -->
      <div v-if="showDots" class="dots" aria-hidden="true">
        <i v-for="n in 3" :key="n" :class="{ on: levelIndex >= n }"></i>
      </div>
    </main>

    <!-- ============================ 通关明信片 ============================ -->
    <PostcardModal
      :show="postcardOpen"
      :photo="photo"
      :config="CONFIG"
      @accept="onPostcardAccept"
    />

    <!-- 全局自定义提示（代替原生 alert） -->
    <ToastHost />

    <!-- 横屏时礼貌地请她转回来（纯 CSS 控制，竖屏时不存在） -->
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
/* ---------------------------------------------------------------- 背景层 */
.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  /* 背景层永远不吃手势 */
  pointer-events: none;
}

/* 主渐变：香槟金 → 冷玫瑰 */
.bg-base {
  position: absolute;
  inset: 0;
  background: linear-gradient(165deg, #f9ecd7 0%, #f7e2e2 42%, #f2dbe4 70%, #eccfda 100%);
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
