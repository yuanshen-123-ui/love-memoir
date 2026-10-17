<script setup>
/**
 * ============================================================================
 *  结局：星空 + 打字机 + 贴贴
 *  ---------------------------------------------------------------------------
 *  天空的「粒子」是 36 个小圆点，每个只有 opacity / transform 的无限闪烁动画，
 *  它们被合成器接管后几乎不占主线程 —— 这是「轻量级粒子」最省的实现方式：
 *  不用 Canvas，也不用 requestAnimationFrame。
 *
 *  打字机在 useTypewriter 里（逐字 + 标点停顿 + 尊重减少动效设置）。
 * ========================================================================== */
import { ref, computed, onMounted } from 'vue'
import GlassButton from './GlassButton.vue'
import HeartRain from './HeartRain.vue'
import { useTypewriter } from '../composables/useTypewriter.js'
import { vibrate } from '../utils/misc.js'

const props = defineProps({
  config: { type: Object, required: true },
})

const copy = props.config.ending

/* ---------------------------------------------------------------- 打字机 */
const { shown, done, start } = useTypewriter(copy.line, { speed: 100, startDelay: 700 })

onMounted(() => {
  // 星星先闪起来，再开始打字 —— 给一个呼吸的间隙
  start()
})

/* ---------------------------------------------------------------- 星空粒子 */
/** 固定种子生成，保证每次进入结局星图一致（不会闪来闪去） */
function makeStars(count) {
  let state = 20241010
  const rand = () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: rand() * 100,
    top: rand() * 100,
    size: 1.2 + rand() * 2.2,
    delay: rand() * 4,
    duration: 2.6 + rand() * 3.4,
    bright: 0.4 + rand() * 0.6,
  }))
}
const stars = makeStars(36)

/* ---------------------------------------------------------------- 贴贴 */
const hugCount = ref(0)
const rainOn = ref(false)
const rainRound = ref(0)

function hug() {
  hugCount.value += 1
  // 每次都换一轮，重新生成一套随机轨迹（连点也不会觉得重复）
  rainRound.value += 1
  rainOn.value = true
  vibrate([10, 26, 10])
}

function onRainFinished() {
  // 这一轮爱心全落完了，卸掉 DOM，避免几十个节点常驻
  rainOn.value = false
}

const hugLabel = computed(() => (hugCount.value > 0 ? `${copy.hug} ×${hugCount.value}` : copy.hug))
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

      <h2 class="ending-line">
        <span>{{ shown }}</span>
        <span v-if="!done" class="caret" aria-hidden="true"></span>
      </h2>

      <Transition name="fade">
        <div v-if="done" class="ending-actions">
          <GlassButton size="sm" @click="hug">{{ hugLabel }}</GlassButton>
        </div>
      </Transition>

      <Transition name="fade">
        <p v-if="hugCount > 0" class="ending-after">{{ copy.after }}</p>
      </Transition>
    </div>

    <!-- 撒花层：纯 CSS 爱心，on animationend 后由父级卸载 -->
    <HeartRain v-if="rainOn" :key="rainRound" :count="44" :round="rainRound" @finished="onRainFinished" />
  </section>
</template>

<style scoped>
/* 结局是「夜里」，文字整体转暖白，和前面的暖棕形成昼夜对比 */
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
  background: radial-gradient(circle, #fffdf6 0%, rgba(255, 245, 220, 0.65) 55%, rgba(255, 245, 220, 0) 100%);
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
  font-size: clamp(21px, 6.2vw, 29px);
  font-weight: 600;
  line-height: 1.7;
  letter-spacing: 1.5px;
  color: #fff6ea;
  /* 轻微的文字发光，让白字在星空里有柔焦感 */
  text-shadow: 0 1px 12px rgba(255, 220, 180, 0.35), 0 1px 2px rgba(0, 0, 0, 0.28);
  /* 预留两行高度，打字过程中不会因为换行把按钮往上顶 */
  min-height: 2.6em;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
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
</style>
