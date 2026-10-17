<script setup>
/**
 * ============================================================================
 *  /a/:id —— 播放页（别人打开分享链接看到的那一面）
 *  ---------------------------------------------------------------------------
 *  流程：拉数据 → 封面（点一下开始）→ 20 张照片卡点播放 → 撒花 + 结尾那句话
 *
 *  为什么封面要「点一下开始」：
 *    iOS/微信 不允许页面自动出声，必须有一次用户手势才能创建 AudioContext。
 *    这个按钮正好既是「开始播放」也是「解锁声音」的那一下。
 * ========================================================================== */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'

import { getAlbum } from '../api/client.js'
import { unlock, startMusic, setMood, stopMusic, sfx } from '../audio/sound.js'
import { CONFIG } from '../config.js'
import BgDecor from '../components/BgDecor.vue'
import StarLevel from '../components/StarLevel.vue'
import MontagePlayer from '../components/MontagePlayer.vue'
import HeartRain from '../components/HeartRain.vue'
import GlassButton from '../components/GlassButton.vue'

const route = useRoute()
const router = useRouter()

/** loading | error | cover | star | play | ended */
const state = ref('loading')
const album = ref(null)
const errorText = ref('')
/** 撒花轮次（重播 +1，重新生成一套随机爱心） */
const round = ref(1)
/** 重播时用 key 强制重挂播放器 */
const playKey = ref(1)

const config = computed(() => album.value?.config || {})
const photoUrls = computed(() => (album.value?.photos || []).map((p) => p.url))
const captions = computed(() =>
  // 字幕条数和照片数对齐，短的补空
  photoUrls.value.map((_, i) => config.value.captions?.[i] || ''),
)
const names = computed(() => {
  const author = (config.value.author || '').trim()
  const partner = (config.value.partner || '').trim()
  if (author && partner) return `${author} · ${partner}`
  return partner || author
})
const seconds = computed(() => (photoUrls.value.length * 1.5).toFixed(1).replace(/\.0$/, ''))

onMounted(async () => {
  try {
    album.value = await getAlbum(route.params.id)
    if (config.value.title) document.title = config.value.title
    state.value = 'cover'
  } catch (err) {
    errorText.value = err.message || '打不开这份回忆录'
    state.value = 'error'
  }
})

function start() {
  unlock()
  startMusic('game')
  // 先点亮 13 颗心形星星，再放照片 —— 这个仪式感是这条回忆录的灵魂，不能省
  state.value = 'star'
}

/** 13 颗星全亮 → 开始照片短片 */
function onStarsDone() {
  state.value = 'play'
}

function onEnded() {
  setMood('ending')
  round.value += 1
  state.value = 'ended'
  sfx.heart()
}

function replay() {
  playKey.value += 1
  unlock()
  startMusic('game')
  state.value = 'play'
}

onBeforeUnmount(stopMusic)
</script>

<template>
  <div class="av">
    <!-- ============================== 加载中 ============================== -->
    <div v-if="state === 'loading'" class="center">
      <p class="tip">正在打开回忆录…</p>
    </div>

    <!-- ============================== 打不开 ============================== -->
    <div v-else-if="state === 'error'" class="center">
      <BgDecor />
      <div class="card glass glass--strong">
        <p class="card-title">这份回忆录打不开</p>
        <p class="card-hint">{{ errorText }}</p>
        <GlassButton block @click="router.push('/')">我也做一个</GlassButton>
      </div>
    </div>

    <!-- ============================== 封面 ============================== -->
    <section v-else-if="state === 'cover'" class="cover">
      <BgDecor />
      <div class="cover-inner">
        <p v-if="config.met_at" class="cover-date">{{ config.met_at }}</p>
        <h1 class="cover-title">{{ config.title }}</h1>
        <p v-if="names" class="cover-names">{{ names }}</p>

        <button type="button" class="start-btn" @click="start">
          <span class="start-ico" aria-hidden="true">▶</span>
          <span>开始</span>
        </button>

        <p class="cover-hint">
          13 颗星星 · {{ photoUrls.length }} 张照片 · {{ seconds }} 秒
        </p>
      </div>

      <RouterLink class="made-by" to="/">我也做一份</RouterLink>
    </section>

    <!-- ============================== 点亮一颗心 ============================== -->
    <main v-else-if="state === 'star'" class="stage">
      <BgDecor />
      <StarLevel :config="CONFIG" @done="onStarsDone" />
    </main>

    <!-- ============================== 播放 ============================== -->
    <MontagePlayer
      v-else-if="state === 'play'"
      :key="playKey"
      :photos="photoUrls"
      :lines="captions"
      tone="site"
      @ended="onEnded"
    />

    <!-- ============================== 结尾 ============================== -->
    <section v-else class="ended">
      <BgDecor />
      <HeartRain :round="round" />

      <div class="ended-inner">
        <p class="ended-line">{{ config.ending_line }}</p>
        <p v-if="config.message" class="ended-msg">{{ config.message }}</p>

        <div class="ended-actions">
          <GlassButton @click="replay">再看一遍</GlassButton>
          <GlassButton variant="ghost" @click="router.push('/')">我也做一份</GlassButton>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.av {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

/* -------------------------------------------------------------- 加载/错误 */
.center {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
}
.tip {
  font-size: 13px;
  letter-spacing: 0.6px;
  color: var(--c-ink-soft);
  animation: blink 1.4s ease-in-out infinite;
}
@keyframes blink {
  50% {
    opacity: 0.45;
  }
}
.card {
  width: min(88vw, 340px);
  padding: 24px 20px 20px;
  border-radius: 24px;
  text-align: center;
}
.card-title {
  margin: 0 0 8px;
  font-size: 17px;
  font-weight: 700;
  color: #6d4a52;
}
.card-hint {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--c-ink-soft);
}

/* ------------------------------------------------------------------ 封面 */
.cover {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 32px 26px;
}
.cover-inner {
  position: relative;
  z-index: 1;
  text-align: center;
  animation: rise 0.7s var(--ease-spring) both;
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translate3d(0, 18px, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.cover-date {
  margin: 0 0 14px;
  font-size: 12.5px;
  letter-spacing: 2px;
  color: var(--c-ink-soft);
}
.cover-title {
  margin: 0 0 10px;
  font-family: var(--font-serif);
  font-size: clamp(23px, 7vw, 30px);
  font-weight: 600;
  letter-spacing: 1px;
  color: #6d4a52;
}
.cover-names {
  margin: 0 0 30px;
  font-size: 13.5px;
  letter-spacing: 1px;
  color: var(--c-rose-deep);
}

.start-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 14px 30px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--c-gold-deep), var(--c-rose-deep));
  color: #fff;
  font-size: 15px;
  letter-spacing: 1px;
  box-shadow: 0 10px 26px rgba(180, 110, 130, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.45);
  transition: transform 0.18s var(--ease-spring);
}
.start-btn:active {
  transform: scale(0.96);
}
.start-ico {
  font-size: 11px;
}
.cover-hint {
  margin: 18px 0 0;
  font-size: 11.5px;
  letter-spacing: 0.6px;
  color: rgba(109, 74, 82, 0.55);
}

.made-by {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 20px);
  text-align: center;
  font-size: 11.5px;
  letter-spacing: 0.6px;
  color: rgba(109, 74, 82, 0.5);
  text-decoration: none;
}

/* ------------------------------------------------------------------ 结尾 */
.ended {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 30px 26px calc(env(safe-area-inset-bottom, 0px) + 30px);
}
.ended-inner {
  position: relative;
  z-index: 2;
  text-align: center;
  animation: rise 0.9s var(--ease-spring) both;
}
.ended-line {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(20px, 6vw, 26px);
  line-height: 1.7;
  letter-spacing: 1px;
  color: #6d4a52;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}
.ended-msg {
  margin: 18px auto 0;
  max-width: 78vw;
  font-size: 13.5px;
  line-height: 1.8;
  color: var(--c-ink-soft);
}
.ended-actions {
  display: grid;
  gap: 10px;
  margin-top: 34px;
  width: min(70vw, 260px);
  margin-left: auto;
  margin-right: auto;
}
</style>
