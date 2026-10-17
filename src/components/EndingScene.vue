<script setup>
/**
 * 结局 · 星空 / 打字机 / 贴贴
 * ============================================================================
 *  这里藏着两个彩蛋（她大概率会自己撞上一个）：
 *    1. 连点「贴贴」10 次 → 冒出一句「你也太黏人了吧……我喜欢。」
 *    2. 长按「遇见你，是我最幸运的事。」1.5 秒 → 浮出一句只有长按才看得到的话
 *
 *  星空是三四十个纯 CSS 小圆点，每个只有一个 opacity/transform 的无限闪烁动画，
 *  被合成器接管后几乎不占主线程 —— 这就是「轻量级粒子」最省的实现：
 *  不用 Canvas，也不用 requestAnimationFrame。
 * ========================================================================== */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import GlassButton from './GlassButton.vue'
import HeartRain from './HeartRain.vue'
import { useTypewriter } from '../composables/useTypewriter.js'
import { makeLcg } from '../utils/random.js'
import { vibrate } from '../utils/misc.js'
import { sfx, setMood } from '../audio/sound.js'
import { toast } from '../composables/useToast.js'

const props = defineProps({
  config: { type: Object, required: true },
})
const emit = defineEmits(['restart'])

const copy = props.config.ending
const ui = props.config.ui

/* ---------------------------------------------------------------- 打字机 */
const { shown, done, start } = useTypewriter(copy.line, { speed: 100, startDelay: 700 })

/* ---------------------------------------------------------------- 星空 */
/** 固定种子生成：每次进入结局星图一致，不会「闪来闪去」 */
const stars = (() => {
  const rand = makeLcg(20241010)
  return Array.from({ length: 36 }, (_, i) => ({
    id: i,
    left: rand() * 100,
    top: rand() * 100,
    size: 1.2 + rand() * 2.2,
    delay: rand() * 4,
    duration: 2.6 + rand() * 3.4,
    bright: 0.4 + rand() * 0.6,
  }))
})()

/* ---------------------------------------------------------------- 贴贴 */
const hugCount = ref(0)
const rainOn = ref(false)
const rainRound = ref(0)
const eggShown = ref(false)

function hug() {
  hugCount.value += 1
  rainRound.value += 1
  rainOn.value = true
  vibrate([10, 26, 10])
  sfx.heart()

  // 彩蛋 1：连点够多次
  if (hugCount.value >= ui.hugEggAt && !eggShown.value) {
    eggShown.value = true
    setTimeout(() => toast(ui.hugEggLine, 2600), 500)
  }
}

function onRainFinished() {
  // 这一轮落完就卸掉 DOM，不留几十个节点常驻
  rainOn.value = false
}

const hugLabel = computed(() => (hugCount.value > 0 ? `${copy.hug} ×${hugCount.value}` : copy.hug))

/* ------------------------------------------------- 彩蛋 2：长按那句话 */
const secretShown = ref(false)
let pressTimer = 0

function pressStart() {
  if (secretShown.value) return
  clearTimeout(pressTimer)
  pressTimer = window.setTimeout(() => {
    secretShown.value = true
    vibrate([8, 40, 8])
    sfx.pop()
  }, 1500)
}
function pressEnd() {
  clearTimeout(pressTimer)
}

/* -------------------------------------------------------------- 生命周期 */
onMounted(() => {
  start()
  // 结局换成更慢、更空的音乐（同一个八音盒，只是换了呼吸）
  setMood('ending')
})

onBeforeUnmount(() => {
  clearTimeout(pressTimer)
})
</script>

<template>
  <section class="screen ending-screen">
    <!-- 纯 CSS 星空：径向渐变 + 36 个闪烁小点 -->
    <div class="sky" aria-hidden="true">
      <span
        v-for="s in stars"
        :key="s.id"
        class="sky-star"
        :style="{
          left: s.left + '%',
          top: s.top + '%',
          width: s.size + 'px',
          height: s.size + 'px',
          opacity: s.bright,
          '--delay': s.delay + 's',
          '--dur': s.duration + 's',
        }"
      ></span>
    </div>

    <div class="ending-body">
      <p class="ending-kicker">{{ copy.kicker }}</p>

      <!-- 长按这块文字 1.5 秒，会浮出一句只给你看的话 -->
      <h2
        class="ending-line"
        @pointerdown="pressStart"
        @pointerup="pressEnd"
        @pointerleave="pressEnd"
        @pointercancel="pressEnd"
      >
        <span>{{ shown }}</span>
        <span v-if="!done" class="caret" aria-hidden="true"></span>
      </h2>

      <Transition name="fade">
        <p v-if="secretShown" class="ending-secret">{{ copy.secret }}</p>
      </Transition>

      <Transition name="fade">
        <div v-if="done" class="ending-actions">
          <GlassButton size="sm" @click="hug">{{ hugLabel }}</GlassButton>
        </div>
      </Transition>

      <Transition name="fade">
        <p v-if="hugCount > 0" class="ending-after">{{ copy.after }}</p>
      </Transition>

      <Transition name="fade">
        <button v-if="done" type="button" class="ending-restart press" @click="emit('restart')">
          再看一遍
        </button>
      </Transition>
    </div>

    <!-- 撒花层：纯 CSS 爱心，落完由父级卸载 -->
    <HeartRain v-if="rainOn" :key="rainRound" :count="44" :round="rainRound" @finished="onRainFinished" />
  </section>
</template>

<style scoped>
/* 结局是「夜里」：文字整体转暖白，和前面的暖棕形成昼夜对比 */
.ending-screen {
  color: #fdf1e6;
  justify-content: center;
}

/* ---------------------------------------------------------------- 星空 */
.sky {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.sky-star {
  position: absolute;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    #fffdf6 0%,
    rgba(255, 245, 220, 0.65) 55%,
    rgba(255, 245, 220, 0) 100%
  );
  animation: twinkle var(--dur) ease-in-out var(--delay) infinite alternate;
  will-change: transform, opacity;
}

/* ---------------------------------------------------------------- 文案 */
.ending-body {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 0 8px;
}

.ending-kicker {
  margin: 0 0 18px;
  font-size: 11.5px;
  letter-spacing: 3px;
  color: rgba(255, 238, 218, 0.55);
}

.ending-line {
  margin: 0;
  /* 宋体/衬线写情话比黑体更有「信纸感」，iOS 命中 Songti SC */
  font-family: var(--font-serif);
  font-size: clamp(21px, 6.2vw, 29px);
  font-weight: 600;
  line-height: 1.7;
  letter-spacing: 1.5px;
  color: #fff6ea;
  text-shadow: 0 1px 12px rgba(255, 220, 180, 0.35), 0 1px 2px rgba(0, 0, 0, 0.28);
  /* 预留两行高度，打字过程中不会因为换行把按钮往上顶 */
  min-height: 2.6em;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  /* 长按不要触发选择/放大镜 */
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
}

/* 打字机光标 */
.caret {
  display: inline-block;
  width: 2px;
  height: 1.05em;
  margin-left: 3px;
  background: linear-gradient(180deg, #ffe8c4, #f0b8c6);
  animation: caret 1s step-end infinite;
  transform: translateY(0.12em);
}

/* 长按才出现的那句 */
.ending-secret {
  margin: 18px 0 0;
  max-width: 82vw;
  font-family: var(--font-serif);
  font-size: 13.5px;
  line-height: 1.9;
  letter-spacing: 1px;
  color: rgba(255, 226, 205, 0.82);
  animation: floatUp 0.7s var(--ease-spring) both;
}

.ending-actions {
  margin-top: 26px;
}
.ending-actions :deep(.btn) {
  /* 星空里的次按钮改成亮边玻璃，不然深底上看不见 */
  color: #fff4e6;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 236, 214, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 8px 22px rgba(0, 0, 0, 0.18);
  -webkit-backdrop-filter: blur(var(--glass-blur));
  backdrop-filter: blur(var(--glass-blur));
  padding: 0 30px;
}

.ending-after {
  margin: 22px 0 0;
  font-size: 13.5px;
  letter-spacing: 1px;
  color: rgba(255, 236, 220, 0.72);
  animation: floatUp 0.6s var(--ease-spring) both;
}

.ending-restart {
  margin-top: 26px;
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: rgba(255, 240, 226, 0.5);
  border: 1px solid rgba(255, 236, 214, 0.18);
}
</style>
