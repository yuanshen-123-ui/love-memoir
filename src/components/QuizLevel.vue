<script setup>
/**
 * ============================================================================
 *  第三关 · 默契挑战：选对了才放行，选错了整张卡片弹性抖动
 *  ---------------------------------------------------------------------------
 *  为什么选项放最下面：
 *    手机单手操作时大拇指的活动范围是屏幕下半部的弧形区域，
 *    题目在上、选项在下 = 不需要挪手，只需要动拇指。
 *
 *  抖动为什么用 CSS @keyframes 而不是 transition：
 *    抖动是一条「来回衰减」的多段轨迹，transition 只能做单段过渡，
 *    硬用 transition 会变成抖一下就弹回来、没有弹性衰减的味道。
 * ========================================================================== */
import { ref, computed } from 'vue'
import { vibrate, pickOne } from '../utils/misc.js'
import { toast } from '../composables/useToast.js'

const props = defineProps({
  config: { type: Object, required: true },
})
const emit = defineEmits(['done'])

const quiz = props.config.quiz
const questions = quiz.questions

const index = ref(0)
const shaking = ref(false)
const rightIndex = ref(-1)
/** 正确后短暂锁住，防止连点提前跳过 */
const locked = ref(false)

const current = computed(() => questions[index.value])
const isLast = computed(() => index.value === questions.length - 1)

/** 选一个答案 */
function choose(i) {
  if (locked.value || shaking.value) return

  const option = current.value.options[i]
  if (option.ok) {
    locked.value = true
    rightIndex.value = i
    vibrate(14)
    // 停 700ms 让人看清「答对了」，再进下一题
    setTimeout(() => {
      if (isLast.value) {
        emit('done')
        return
      }
      index.value += 1
      rightIndex.value = -1
      locked.value = false
    }, 700)
    return
  }

  // 答错：抖一下 + 轻震动 + 一句安慰
  shaking.value = true
  vibrate([14, 34, 14])
  toast(pickOne(quiz.wrong), 1600)
  setTimeout(() => {
    shaking.value = false
  }, 520)
}
</script>

<template>
  <section class="screen quiz-screen">
    <header class="lv-head">
      <p class="lv-kicker">{{ quiz.kicker }}</p>
      <h2 class="lv-title">{{ quiz.title }}</h2>
      <p class="lv-sub">第 {{ index + 1 }} / {{ questions.length }} 题</p>
    </header>

    <!-- 题目卡片：抖动作用在它身上 -->
    <div class="quiz-body">
      <div class="quiz-card glass" :class="{ 'is-shaking': shaking, 'is-right': locked }">
        <span class="quiz-mark" aria-hidden="true">♥</span>
        <p class="quiz-q">{{ current.q }}</p>
        <p class="quiz-hint">{{ quiz.hint }}</p>
      </div>
    </div>

    <!-- 选项区：贴底，拇指友好 -->
    <footer class="thumb-bar quiz-options">
      <button
        v-for="(opt, i) in current.options"
        :key="i"
        type="button"
        class="quiz-opt"
        :class="{ 'is-right': rightIndex === i }"
        :disabled="locked"
        @click="choose(i)"
      >
        <span class="quiz-opt-idx">{{ String.fromCharCode(65 + i) }}</span>
        <span class="quiz-opt-text">{{ opt.text }}</span>
        <span v-if="rightIndex === i" class="quiz-opt-ok" aria-hidden="true">✓</span>
      </button>
    </footer>
  </section>
</template>

<style scoped>
/* ---------------------------------------------------------------- 题目卡片 */
.quiz-body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 0 18px;
}

.quiz-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: 28px 22px 26px;
  border-radius: 26px;
  text-align: center;
  /* 抖动用的基础状态；具体位移在全局 @keyframes shake 里 */
  animation: floatUp 0.5s var(--ease-spring) both;
  will-change: transform;
}
.quiz-card.is-shaking {
  animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
.quiz-card.is-right {
  box-shadow: var(--glass-shadow), var(--glass-inner),
    0 0 0 1px rgba(214, 158, 120, 0.5), 0 0 26px rgba(255, 206, 150, 0.45);
  transition: box-shadow 0.3s ease;
}

.quiz-mark {
  display: block;
  font-size: 17px;
  color: rgba(214, 146, 160, 0.55);
  margin-bottom: 8px;
}
.quiz-q {
  margin: 0;
  font-size: 19px;
  font-weight: 650;
  line-height: 1.55;
  letter-spacing: 0.3px;
  color: #533c43;
}
.quiz-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--c-ink-faint);
}

/* ---------------------------------------------------------------- 选项按钮 */
.quiz-options {
  padding-top: 6px;
}
.quiz-opt {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 58px;
  padding: 12px 16px;
  border-radius: 20px;
  text-align: left;
  font-size: 15.5px;
  font-weight: 500;
  line-height: 1.4;
  color: #533c43;
  /* 玻璃：和 .glass 同样的配方，写在组件里是为了能加按压态 */
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-inner), 0 6px 18px rgba(170, 110, 130, 0.1);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  backdrop-filter: blur(var(--glass-blur)) saturate(180%);
  transition: transform 0.16s var(--ease-out), box-shadow 0.2s ease, background 0.2s ease;
  will-change: transform;
}
.quiz-opt:active {
  transform: scale(0.96);
}
.quiz-opt:disabled {
  opacity: 0.96;
}
.quiz-opt.is-right {
  background: linear-gradient(135deg, rgba(255, 236, 205, 0.95), rgba(249, 213, 223, 0.95));
  border-color: rgba(224, 178, 140, 0.8);
  box-shadow: var(--glass-inner), 0 8px 22px rgba(216, 158, 130, 0.3);
}

.quiz-opt-idx {
  flex: none;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 12.5px;
  font-weight: 700;
  color: #9d6a76;
  background: rgba(255, 255, 255, 0.75);
  box-shadow: inset 0 0 0 1px rgba(190, 150, 160, 0.24);
}
.quiz-opt.is-right .quiz-opt-idx {
  color: #fff;
  background: linear-gradient(135deg, var(--c-gold-deep), var(--c-rose-deep));
  box-shadow: none;
}
.quiz-opt-text {
  flex: 1 1 auto;
  min-width: 0;
}
.quiz-opt-ok {
  flex: none;
  font-size: 16px;
  font-weight: 700;
  color: #c58a3f;
  animation: popIn 0.3s var(--ease-spring) both;
}
</style>
