<script setup>
/**
 * ============================================================================
 *  分享海报弹层
 *  ---------------------------------------------------------------------------
 *  微信里保存图片的「正确姿势」是长按图片 → 保存到相册。
 *  所以这里把 Canvas 画好的海报以 <img> 呈现，主提示就是「长按保存」；
 *  同时给一个 <a download> 作为兜底（Safari / Chrome 里点它直接进相册或文件）。
 *
 *  注意：WeChat 内置浏览器对 download 属性支持不稳定，所以长按才是主路径。
 * ========================================================================== */
import { ref, watch, onBeforeUnmount } from 'vue'
import GlassButton from './GlassButton.vue'
import { renderPoster } from '../utils/poster.js'
import { toast } from '../composables/useToast.js'

const props = defineProps({
  show: { type: Boolean, default: false },
  photo: { type: String, default: null },
  config: { type: Object, required: true },
})
const emit = defineEmits(['close'])

const copy = props.config.poster
const dataURL = ref('')
const loading = ref(false)
const ready = ref(false)

/** 打开时生成；关掉后释放（一张 750×1200 的 JPEG dataURL 大约 200~400KB 字符串，别常驻） */
watch(
  () => props.show,
  async (visible) => {
    if (!visible) return
    if (dataURL.value) return
    loading.value = true
    ready.value = false
    try {
      dataURL.value = await renderPoster({ photo: props.photo, copy })
      ready.value = true
    } catch (err) {
      console.warn('[love-memoir] 海报生成失败', err)
      toast(copy.fail, 2200)
      emit('close')
    } finally {
      loading.value = false
    }
  },
)

onBeforeUnmount(() => {
  dataURL.value = ''
})

function close() {
  emit('close')
}
</script>

<template>
  <Transition name="pc">
    <div v-if="show" class="ps-overlay" role="dialog" aria-modal="true" :aria-label="copy.title">
      <div class="ps glass glass--strong">
        <p class="ps-title">{{ copy.title }}</p>

        <div class="ps-frame">
          <div v-if="loading" class="ps-loading">
            <span class="ps-spinner" aria-hidden="true"></span>
            <span>{{ copy.loading }}</span>
          </div>
          <!-- 长按这张图 → 保存到相册（微信 / iOS Safari 都支持） -->
          <img v-else-if="ready" class="ps-img" :src="dataURL" alt="我们的回忆卡片" />
        </div>

        <p class="ps-hint">{{ copy.hint }}</p>
        <p class="ps-hint ps-hint--sub">{{ copy.hintFallback }}</p>

        <div class="ps-actions">
          <!-- 主动作是「存下来」，所以用渐变主按钮；关闭做成次级的玻璃按钮 -->
          <a
            v-if="ready"
            class="btn btn--block ps-download"
            :href="dataURL"
            download="love-memoir.jpg"
          >
            {{ copy.download }}
          </a>
          <GlassButton block variant="ghost" @click="close">{{ copy.close }}</GlassButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ps-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(58, 38, 46, 0.28);
  padding: 0 7.5vw calc(12px + var(--safe-bottom));
}

.ps {
  width: 85vw;
  max-width: 380px;
  max-height: 88%;
  display: flex;
  flex-direction: column;
  border-radius: 26px;
  padding: 20px 18px 16px;
  overflow: hidden;
}

.ps-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 15px;
  font-weight: 650;
  color: #6d4a52;
}

.ps-frame {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  place-items: center;
  border-radius: 16px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.4);
}
.ps-img {
  width: 100%;
  height: auto;
  max-height: 52vh;
  object-fit: contain;
  display: block;
  border-radius: 12px;
  /* 长按保存是主路径，别让长按弹系统菜单时选到别的 */
  -webkit-touch-callout: default;
  user-select: auto;
  -webkit-user-select: auto;
}

.ps-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 40px 16px;
  font-size: 13px;
  color: var(--c-ink-soft);
  text-align: center;
}
.ps-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid rgba(160, 118, 130, 0.22);
  border-top-color: var(--c-rose-deep);
  animation: spin 0.9s linear infinite;
}

.ps-hint {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12.5px;
  font-weight: 600;
  color: #8a5a63;
}
.ps-hint--sub {
  margin-top: 4px;
  font-weight: 400;
  font-size: 11.5px;
  color: var(--c-ink-faint);
}

.ps-actions {
  flex: none;
  display: grid;
  gap: 9px;
  padding-top: 12px;
}
.ps-download {
  text-decoration: none;
  font-size: 16px;
}
</style>
