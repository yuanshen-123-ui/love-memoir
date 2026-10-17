<script setup>
/**
 * ============================================================================
 *  /letter —— 最早那封「只能给她看」的固定版
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
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

import { CONFIG } from '../config.js'
import { loadPhoto, saveProgress, loadProgress, clearProgress, clearAll } from '../utils/storage.js'
import { warnConfigIssues } from '../utils/validateConfig.js'
import { unlock, startMusic, stopMusic } from '../audio/sound.js'

import BgDecor from '../components/BgDecor.vue'
import UploadFrame from '../components/UploadFrame.vue'
import StarLevel from '../components/StarLevel.vue'
import ScratchLevel from '../components/ScratchLevel.vue'
import QuizLevel from '../components/QuizLevel.vue'
import PostcardModal from '../components/PostcardModal.vue'
import EndingScene from '../components/EndingScene.vue'

/** 状态枚举（Object.freeze 防止手滑改掉） */
const PHASE = Object.freeze({
  UPLOAD: 'upload',
  START: 'start',
  LEVEL1: 'level1',
  LEVEL2: 'level2',
  LEVEL3: 'level3',
  ENDING: 'ending',
})

const currentState = ref(PHASE.UPLOAD)
/** 我们的照片（dataURL），一路传到相框 / 刮刮乐 / 明信片 / 海报 */
const photo = ref(null)
/** 通关明信片弹层 */
const postcardOpen = ref(false)

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
  stopMusic()
  currentState.value = PHASE.UPLOAD
}

/* -------------------------------------------------------------- 生命周期 */
let firstPointer = null

onMounted(() => {
  // config 自检：改错字段只在控制台提醒
  warnConfigIssues(CONFIG)

  // 1) iOS/微信 要求音频在用户手势里解锁 —— 全局挂一次，点到哪都算
  firstPointer = () => unlock()
  document.addEventListener('pointerdown', firstPointer, { passive: true, once: true })

  // 2) 调试小后门（README 有说明）。
  //    必须放在「没有照片就 return」之前，否则新访客在控制台里拿不到这个对象。
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
    const mood = musicFor(stage)
    if (mood) startMusic(mood)
  } else {
    currentState.value = PHASE.START
  }
})

onBeforeUnmount(() => {
  if (firstPointer) document.removeEventListener('pointerdown', firstPointer)
  delete window.__loveMemoir__
  // 离开这个页面就把音乐停掉，不要带着 BGM 去别的页面
  stopMusic()
})
</script>

<template>
  <div class="view">
    <!-- 背景：香槟金 → 冷玫瑰，结局过渡到星空 -->
    <BgDecor :night="isNight" />

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
  </div>
</template>

<style scoped>
.view {
  position: relative;
  height: 100%;
  overflow: hidden;
}
</style>
