<script setup>
/**
 * ============================================================================
 *  通关弹窗：玻璃质感明信片
 *  ---------------------------------------------------------------------------
 *  小屏适配要点：
 *    · 宽度 85vw（不是固定 px），左右各留 7.5% 的呼吸位
 *    · 高度自适应但设上限 84%，内容超出时只有卡片内部滚动 ——
 *      整页永远不滚，符合「防回弹」的整体设定
 *    · 底部按钮额外让出 env(safe-area-inset-bottom)
 *    · 上浮用弹簧曲线：从屏幕底部"抽出来"的手感
 * ========================================================================== */
import { computed } from 'vue'
import GlassButton from './GlassButton.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  photo: { type: String, default: null },
  config: { type: Object, required: true },
})
const emit = defineEmits(['accept'])

const pc = computed(() => props.config.postcard)
</script>

<template>
  <Transition name="pc">
    <div v-if="show" class="pc-overlay" role="dialog" aria-modal="true" aria-label="通关明信片">
      <div class="pc glass glass--strong">
        <!-- 邮票装饰 -->
        <span class="pc-stamp" aria-hidden="true">
          <span class="pc-stamp-heart">♥</span>
        </span>

        <div class="pc-scroll scroll-y">
          <p class="pc-title">{{ pc.title }}</p>

          <div v-if="photo" class="pc-photo">
            <img :src="photo" alt="我们的照片" />
          </div>

          <p class="pc-to">{{ pc.to }}</p>

          <div class="pc-lines">
            <p v-for="(line, i) in pc.lines" :key="i" class="pc-line" :style="{ '--i': i }">
              {{ line }}
            </p>
          </div>

          <p class="pc-sign">{{ pc.sign }}</p>
          <p class="pc-date">{{ pc.date }}</p>
        </div>

        <div class="pc-actions">
          <GlassButton block @click="emit('accept')">{{ pc.accept }}</GlassButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pc-overlay {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* 不用 backdrop-filter：底下已经有一层层模糊玻璃了，再叠一层会明显掉帧，
     一层浅色遮罩就够把注意力收到明信片上 */
  background: rgba(58, 38, 46, 0.22);
  padding: 0 7.5vw calc(12px + var(--safe-bottom));
}

.pc {
  width: 85vw;
  max-width: 380px;
  max-height: 84%;
  display: flex;
  flex-direction: column;
  border-radius: 26px;
  padding: 26px 20px 18px;
  overflow: hidden;
  position: relative;
  /* 明信片的双层描边：外圈细线 + 内圈留白，比单纯圆角更像纸 */
  box-shadow: var(--glass-shadow), var(--glass-inner), 0 0 0 1px rgba(255, 255, 255, 0.5);
}

/* 邮票 */
.pc-stamp {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: linear-gradient(135deg, #fbeacb, #f7d4dd);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8),
    0 2px 6px rgba(170, 110, 130, 0.18);
  transform: rotate(8deg);
}
.pc-stamp-heart {
  font-size: 15px;
  color: #c9808f;
}

.pc-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  text-align: center;
  padding: 2px 4px 6px;
}

.pc-title {
  margin: 0 0 14px;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: 1px;
  background: linear-gradient(120deg, #8a5a48, #c0808f);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.pc-photo {
  width: 100%;
  aspect-ratio: 5 / 4;
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 14px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7), 0 6px 16px rgba(170, 110, 130, 0.16);
}
.pc-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pc-to {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #9d6a76;
  letter-spacing: 0.5px;
}

.pc-line {
  margin: 0 0 6px;
  font-size: 14.5px;
  line-height: 1.7;
  color: #5b4149;
  /* 逐行淡入：不需要 JS，纯 CSS 延迟 */
  animation: floatUp 0.5s var(--ease-spring) both;
  animation-delay: calc(0.16s + var(--i) * 0.14s);
}

.pc-sign {
  margin: 14px 0 0;
  font-size: 13px;
  color: var(--c-ink-soft);
  text-align: right;
  padding-right: 6px;
}
.pc-date {
  margin: 6px 0 0;
  font-size: 11.5px;
  letter-spacing: 1px;
  color: var(--c-ink-faint);
  text-align: right;
  padding-right: 6px;
}

.pc-actions {
  flex: none;
  padding-top: 14px;
}

/* ------------------------------------------------------- 上浮动画（弹簧） */
.pc-enter-active {
  transition: opacity 0.28s ease;
}
.pc-leave-active {
  transition: opacity 0.22s ease;
}
.pc-enter-from,
.pc-leave-to {
  opacity: 0;
}
.pc-enter-active .pc {
  transition: transform 0.52s var(--ease-spring);
}
.pc-leave-active .pc {
  transition: transform 0.22s var(--ease-out);
}
.pc-enter-from .pc,
.pc-leave-to .pc {
  transform: translate3d(0, 105%, 0);
}
</style>
