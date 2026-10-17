<script setup>
/**
 * ============================================================================
 *  我们的恋爱回忆录 —— 根组件（状态机 + 全局背景 + 屏间调度）
 *  ---------------------------------------------------------------------------
 *  状态机：
 *    upload  开场，还没放照片
 *    start   照片已就位（含刷新后从 localStorage 恢复），等用户点「开启回忆」
 *    level1  点亮星星
 *    level2  刮刮乐
 *    level3  默契挑战
 *    ending  结局（星空 + 打字机 + 贴贴）
 *  通关明信片不是独立状态，而是 level3 通关后盖在页面上的弹层。
 *
 *  为什么背景单独一层、不放进各个屏：
 *    背景要在整个流程里保持连续（甚至结局要慢慢变成星空），
 *    如果每屏各画一份，切屏时就会看到背景闪一下。
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

import { CONFIG } from './config.js'
import { useViewportHeight } from './composables/useViewport.js'
import { loadPhoto, clearPhoto } from './utils/storage.js'

import UploadFrame from './components/UploadFrame.vue'
import StarLevel from './components/StarLevel.vue'
import ScratchLevel from './components/ScratchLevel.vue'
import QuizLevel from './components/QuizLevel.vue'
import PostcardModal from './components/PostcardModal.vue'
import EndingScene from './components/EndingScene.vue'
import ToastHost from './components/ToastHost.vue'

/** 状态枚举（用 Object.freeze 防止手滑改掉） */
const PHASE = Object.freeze({
  UPLOAD: 'upload',
  START: 'start',
  LEVEL1: 'level1',
  LEVEL2: 'level2',
  LEVEL3: 'level3',
  ENDING: 'ending',
})

const currentState = ref(PHASE.UPLOAD)
/** 我们的照片（dataURL），一路传到相框 / 刮刮乐 / 明信片 */
const photo = ref(null)
/** 通关明信片弹层 */
const postcardOpen = ref(false)

/* 移动端真实高度（写进 CSS 变量 --app-h），解决 100vh 被地址栏吃掉的老问题 */
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

function go(state) {
  currentState.value = state
}

/* ---------------------------------------------------------------- 事件链 */

/** 选好照片（UploadFrame 已经压缩 + 存好 localStorage） */
function onPicked(dataURL) {
  photo.value = dataURL
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

/* -------------------------------------------------------------- 生命周期 */
onMounted(() => {
  // 刷新后照片还在 → 直接进「开启回忆」，不让用户重选一遍
  const saved = loadPhoto()
  if (saved) {
    photo.value = saved
    currentState.value = PHASE.START
  }

  // 调试用的小后门（README 有说明）：
  //   控制台里 __loveMemoir__.goto('level1')  直接跳关
  //   __loveMemoir__.reset()                  清掉照片重新开始
  window.__loveMemoir__ = {
    goto: go,
    getState: () => currentState.value,
    reset() {
      clearPhoto()
      photo.value = null
      postcardOpen.value = false
      currentState.value = PHASE.UPLOAD
    },
  }
})

onBeforeUnmount(() => {
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

        <EndingScene v-else-if="currentState === PHASE.ENDING" key="ending" :config="CONFIG" />
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
  background: linear-gradient(
    165deg,
    #f9ecd7 0%,
    #f7e2e2 42%,
    #f2dbe4 70%,
    #eccfda 100%
  );
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
