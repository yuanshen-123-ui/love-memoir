<script setup>
/**
 * ============================================================================
 *  开场：液态玻璃相框 + 放入第一张回忆
 *  ---------------------------------------------------------------------------
 *  交互设计（全部为单手/拇指考虑）：
 *    · 相框居中悬浮，空状态时任意点相框 = 打开相册（不需要用户去找按钮）
 *    · 真正的「选照片」是底部拇指区的整宽按钮 —— 站着、走路、躺床上都够得着
 *    · 原生 <input type="file"> 被挪到屏幕外（见 style.css 的 .file-input），
 *      用户永远看不到系统那个丑文件框，只会看到系统相册选择器（这是 iOS 强制的，
 *      任何网页都无法绕过，但它是原生相册、体验是好的）
 *    · 图片压完以弹簧动效落入相框，然后「开启回忆」才出现
 * ========================================================================== */
import { ref, computed } from 'vue'
import GlassButton from './GlassButton.vue'
import { compressImage } from '../utils/image.js'
import { savePhoto } from '../utils/storage.js'
import { toast } from '../composables/useToast.js'
import { vibrate } from '../utils/misc.js'

const props = defineProps({
  /** 已选中的照片 dataURL（从 localStorage 恢复时也有值） */
  photo: { type: String, default: null },
  config: { type: Object, required: true },
})

const emit = defineEmits(['picked', 'start'])

const copy = computed(() => props.config.upload)

const inputEl = ref(null)
const busy = ref(false)
const justPicked = ref(false)

/** 打开系统相册 / 相机。
 *  先把 value 清空：否则用户选同一张照片时不会触发 change 事件（经典坑）。 */
function pick() {
  if (busy.value) return
  const el = inputEl.value
  if (!el) return
  el.value = ''
  el.click()
}

/** 选完文件 → 压缩 → 存 localStorage → 交给父组件 */
async function onChange(event) {
  const file = event.target.files && event.target.files[0]
  if (!file) return

  busy.value = true
  justPicked.value = false
  try {
    const { dataURL } = await compressImage(file)
    const saved = savePhoto(dataURL)
    // 存不下也让它玩完：照片留在内存里，本次会话依然正常
    if (!saved.ok) {
      toast(saved.reason === 'QUOTA' ? copy.value.quota : copy.value.fail, 2600)
    }
    emit('picked', dataURL)
    // 触发「掉进相框」的弹簧动画
    justPicked.value = true
    vibrate(10)
  } catch (err) {
    console.warn('[love-memoir] 图片压缩失败', err)
    toast(copy.value.fail, 2200)
  } finally {
    busy.value = false
  }
}

/** 动画只播一次，播完就摘掉 class，这样再次换照片还能重新播 */
function onDropEnd() {
  justPicked.value = false
}
</script>

<template>
  <section class="screen upload-screen">
    <!-- 标题：克制一点，别抢相框 -->
    <header class="up-head">
      <h1 class="up-title">{{ config.title }}</h1>
      <p class="up-sub">{{ config.subtitle }}</p>
    </header>

    <div class="frame-wrap">
      <!-- 相框本体：液态玻璃边框 + 内部照片 -->
      <div
        class="frame glass"
        :class="{ 'is-empty': !photo }"
        role="button"
        :aria-label="photo ? '已放入照片' : '选择一张照片'"
        @click="pick"
      >
        <div class="frame-inner">
          <!-- 空状态 -->
          <div v-if="!photo" class="frame-empty">
            <span class="frame-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="6" y="11" width="36" height="26" rx="7" stroke="currentColor" stroke-width="2.4" />
                <circle cx="17" cy="21" r="3.2" stroke="currentColor" stroke-width="2.4" />
                <path
                  d="M11 33l8.5-8.5 6 6 4.5-4.5L39 34"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
            </span>
            <p class="frame-tip">{{ copy.frameTip }}</p>
            <p class="frame-hint">{{ copy.frameHint }}</p>
          </div>

          <!-- 有照片：弹簧落入 -->
          <div v-else class="frame-photo" :class="{ 'drop-in': justPicked }" @animationend="onDropEnd">
            <img :src="photo" alt="我们的第一张回忆" />
            <span class="frame-sheen" aria-hidden="true"></span>
          </div>
        </div>

        <!-- 换一张：小胶囊压在照片右下角，不占版面 -->
        <button v-if="photo && !busy" type="button" class="replace press" @click.stop="pick">
          {{ copy.replacing }}
        </button>

        <!-- 压缩中遮罩 -->
        <div v-if="busy" class="frame-busy glass">
          <span class="spinner" aria-hidden="true"></span>
          <span>{{ copy.compressing }}</span>
        </div>
      </div>
    </div>

    <!-- 拇指区：主按钮永远贴底，并让出 iPhone 小黑条 -->
    <footer class="thumb-bar">
      <GlassButton v-if="photo" block @click="emit('start')">{{ copy.opening }}</GlassButton>
      <GlassButton v-else block :disabled="busy" @click="pick">{{ copy.pick }}</GlassButton>
    </footer>

    <!-- 隐藏的原生文件输入框：accept="image/*" 在手机上会唤起「照片图库 / 拍照」二选一 -->
    <input
      ref="inputEl"
      class="file-input"
      type="file"
      accept="image/*"
      aria-hidden="true"
      tabindex="-1"
      @change="onChange"
    />
  </section>
</template>

<style scoped>
.upload-screen {
  /* 上：标题；中：相框（吃掉剩余空间并居中）；下：拇指区 */
  justify-content: flex-start;
}

/* ------------------------------------------------------------------ 标题 */
.up-head {
  flex: none;
  text-align: center;
  padding: 10px 0 2px;
  animation: floatUp 0.6s var(--ease-spring) both;
}
.up-title {
  margin: 0;
  font-size: 25px;
  font-weight: 700;
  letter-spacing: 1.5px;
  background: linear-gradient(120deg, #8a5a48 0%, #b5707f 62%, #cf92a2 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.up-sub {
  margin: 7px 0 0;
  font-size: 12.5px;
  letter-spacing: 1px;
  color: var(--c-ink-faint);
}

/* ------------------------------------------------------------------ 相框 */
.frame-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px 0;
}

.frame {
  position: relative;
  /* 宽度同时受三件事约束：屏宽 82%、最大 320px、以及「高度放得下」。
     第三个条件用 --app-h 算，保证矮屏（如 iPhone SE 667px）也不会把底部按钮挤出去。 */
  width: min(82vw, 320px);
  width: min(82vw, 320px, calc((var(--app-h) - 292px) * 0.8));
  aspect-ratio: 4 / 5;
  border-radius: 30px;
  padding: 9px;
  animation: popIn 0.55s var(--ease-spring) both;
  /* 相框本身也可以点，扩大热区 */
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.18s var(--ease-out);
}
.frame:active {
  transform: scale(0.985);
}

.frame-inner {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 23px;
  overflow: hidden;
  /* 内层再压一层浅色玻璃，制造「玻璃罩住照片」的层次 */
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.42), rgba(255, 255, 255, 0.12));
}
.frame.is-empty .frame-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  /* 虚线内框 = 明确的「这里可以放东西」暗示 */
  box-shadow: inset 0 0 0 1.5px rgba(160, 118, 130, 0.26);
}

/* 空状态 */
.frame-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 18px;
  text-align: center;
}
.frame-icon {
  width: 52px;
  height: 52px;
  color: rgba(150, 110, 122, 0.72);
  animation: breathe 3.6s ease-in-out infinite;
}
.frame-icon svg {
  width: 100%;
  height: 100%;
}
.frame-tip {
  margin: 6px 0 0;
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.45;
  color: #6d4a52;
}
.frame-hint {
  margin: 0;
  font-size: 12.5px;
  color: var(--c-ink-faint);
}

/* 照片 */
.frame-photo {
  position: absolute;
  inset: 0;
  border-radius: 23px;
  overflow: hidden;
}
.frame-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
/* 照片压一层内阴影，边缘才不会「贴」在玻璃上 */
.frame-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.55),
    inset 0 -34px 44px -26px rgba(110, 62, 74, 0.22);
  pointer-events: none;
}
/* 弹簧落图 */
.drop-in {
  animation: dropIn 0.78s var(--ease-spring) both;
}
/* 一次性扫光 */
.frame-sheen {
  position: absolute;
  top: -30%;
  left: 0;
  width: 42%;
  height: 160%;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.5) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  transform: translate3d(-140%, 0, 0) rotate(18deg);
  animation: sheen 1.5s 0.35s ease-out 1 both;
  pointer-events: none;
}

/* 换一张 */
.replace {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 3;
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: rgba(90, 60, 70, 0.42);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

/* 压缩中 */
.frame-busy {
  position: absolute;
  inset: 9px;
  z-index: 4;
  border-radius: 23px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-size: 13.5px;
  color: #6d4a52;
  text-align: center;
  padding: 0 20px;
}
.spinner {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2.5px solid rgba(160, 118, 130, 0.22);
  border-top-color: var(--c-rose-deep);
  animation: spin 0.9s linear infinite;
}
</style>
