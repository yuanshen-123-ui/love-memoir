<script setup>
/**
 * 声音开关（右上角小胶囊）
 *  ---------------------------------------------------------------------------
 *  为什么必须有一个显眼的开关：
 *    默认是开着声音的（音乐是这份心意的一部分），但她完全可能在教室/办公室
 *    打开这个链接。所以第一屏就能看到它、一下就能关掉，是必须的礼貌。
 *
 *  状态持久化：关掉之后刷新还是关掉（storage.js 里的 sound pref）。
 * ========================================================================== */
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { isSoundEnabled, toggleSound, onSoundChange, unlock } from '../audio/sound.js'
import { toast } from '../composables/useToast.js'
import { vibrate } from '../utils/misc.js'

const props = defineProps({
  config: { type: Object, required: true },
})

const enabled = ref(isSoundEnabled())
let off = null

onMounted(() => {
  off = onSoundChange((v) => {
    enabled.value = v
  })
})
onBeforeUnmount(() => {
  if (off) off()
})

function onTap() {
  // 必须先在用户手势里解锁音频上下文，之后才有声音
  unlock()
  const next = toggleSound()
  vibrate(6)
  toast(next ? props.config.ui.soundOn : props.config.ui.soundOff, 1200)
}
</script>

<template>
  <button
    type="button"
    class="sound-toggle press"
    :class="{ 'is-off': !enabled }"
    :aria-label="enabled ? '关闭声音' : '打开声音'"
    :aria-pressed="enabled"
    @click="onTap"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <!-- 喇叭本体 -->
      <path
        d="M4 9.4h3.1L12 5.8v12.4L7.1 14.6H4a1 1 0 0 1-1-1v-3.2a1 1 0 0 1 1-1Z"
        fill="currentColor"
        fill-opacity="0.9"
      />
      <!-- 声波 / 静音斜杠 -->
      <g v-if="enabled" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
        <path d="M17.9 6.9a7.4 7.4 0 0 1 0 10.2" />
      </g>
      <path
        v-else
        d="M15.6 9.6l4.4 4.4M20 9.6l-4.4 4.4"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
    </svg>
  </button>
</template>

<style scoped>
.sound-toggle {
  position: absolute;
  z-index: 20;
  top: calc(var(--safe-top) + 10px);
  right: calc(var(--safe-right) + 12px);
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #6d4a52;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 4px 14px rgba(170, 110, 130, 0.16);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  transition: transform 0.16s var(--ease-out), opacity 0.2s ease;
}
.sound-toggle:active {
  transform: scale(0.92);
}
.sound-toggle svg {
  width: 20px;
  height: 20px;
}
.sound-toggle.is-off {
  color: rgba(109, 74, 82, 0.55);
}
</style>
