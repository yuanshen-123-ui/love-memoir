<script setup>
/**
 * ============================================================================
 *  /  —— 创作页（首页）
 *  ---------------------------------------------------------------------------
 *  三步走：说说你们 → 放照片（每张配一句）→ 生成
 *  生成完拿到一个 /a/{album_id} 的链接，发给谁都能看。
 *
 *  照片全程只在浏览器里压缩（长边 1280 / JPEG 0.82），
 *  上传时以 multipart 送到后端，服务端再洗一遍 EXIF 后落盘。
 * ========================================================================== */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { compressImage } from '../utils/image.js'
import { toast } from '../composables/useToast.js'
import { createAlbum } from '../api/client.js'
import BgDecor from '../components/BgDecor.vue'
import GlassButton from '../components/GlassButton.vue'

const MAX_PHOTOS = 20
const router = useRouter()

const step = ref(1)
const form = reactive({
  title: '我们的恋爱回忆录',
  author: '',
  partner: '',
  met_at: '',
  ending_line: '遇见你，是我最幸运的事。',
  message: '',
})

/** { id, dataURL, caption, width, height, bytes } */
const photos = ref([])
const selectedId = ref('')
const picking = ref(false)
const uploading = ref(false)
const progress = ref(0)
const errorText = ref('')
const result = ref(null)
const fileInput = ref(null)

const selected = computed(() => photos.value.find((p) => p.id === selectedId.value) || null)
const totalMb = computed(() => (photos.value.reduce((sum, p) => sum + (p.bytes || 0), 0) / 1024 / 1024).toFixed(1))
const canNext = computed(() => (step.value === 1 ? form.title.trim().length > 0 : photos.value.length > 0))

let uid = 0

/* ------------------------------------------------------------------ 照片 */
function openPicker() {
  if (photos.value.length >= MAX_PHOTOS) {
    toast(`最多 ${MAX_PHOTOS} 张啦`)
    return
  }
  fileInput.value?.click()
}

async function onFiles(event) {
  const files = Array.from(event.target.files || [])
  // 清空 value：否则再选同一张不会触发 change
  event.target.value = ''
  if (!files.length) return

  picking.value = true
  let added = 0
  for (const file of files) {
    if (photos.value.length >= MAX_PHOTOS) {
      toast(`最多 ${MAX_PHOTOS} 张，多的我没收`)
      break
    }
    if (file.type && !file.type.startsWith('image/')) continue
    try {
      // 长边 1280：手机上够清晰，20 张总共也就 2~3MB
      const shot = await compressImage(file, { maxSize: 1280, quality: 0.82 })
      photos.value.push({ id: `p${++uid}`, ...shot, caption: '' })
      added += 1
    } catch {
      toast('有一张读不出来，换一张试试')
    }
  }
  picking.value = false
  if (added && !selectedId.value) selectedId.value = photos.value[0].id
}

function removePhoto(id) {
  photos.value = photos.value.filter((p) => p.id !== id)
  if (selectedId.value === id) selectedId.value = photos.value[0]?.id || ''
}

function movePhoto(direction) {
  const index = photos.value.findIndex((p) => p.id === selectedId.value)
  const target = index + direction
  if (index < 0 || target < 0 || target >= photos.value.length) return
  const list = photos.value
  ;[list[index], list[target]] = [list[target], list[index]]
}

/* ------------------------------------------------------------------ 流程 */
function next() {
  if (!canNext.value) {
    toast(step.value === 1 ? '先给回忆录起个名字吧' : '至少选一张照片呀')
    return
  }
  step.value += 1
}

function back() {
  if (step.value > 1) step.value -= 1
}

async function submit() {
  if (uploading.value) return
  if (!photos.value.length) {
    step.value = 2
    return
  }
  errorText.value = ''
  uploading.value = true
  progress.value = 0
  try {
    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      partner: form.partner.trim(),
      met_at: form.met_at.trim(),
      message: form.message.trim(),
      ending_line: form.ending_line.trim(),
      captions: photos.value.map((p) => (p.caption || '').trim()),
    }
    const data = await createAlbum(payload, photos.value, (ratio) => {
      progress.value = ratio
    })
    result.value = data
    // 不弹 toast：卡片上已经写着「做好啦」，再弹一次只会盖住下面的按钮
  } catch (err) {
    errorText.value = err.message || '生成失败，稍后再试'
  } finally {
    uploading.value = false
  }
}

async function copyLink() {
  const link = result.value?.share_url || ''
  try {
    await navigator.clipboard.writeText(link)
    toast('链接已复制')
  } catch {
    // 微信/老浏览器里 clipboard 可能不可用 → 退化成选中文本
    const input = document.createElement('textarea')
    input.value = link
    input.style.position = 'fixed'
    input.style.opacity = '0'
    document.body.appendChild(input)
    input.select()
    try {
      document.execCommand('copy')
      toast('链接已复制')
    } catch {
      toast('复制失败，长按上面的链接手动复制')
    }
    document.body.removeChild(input)
  }
}

function preview() {
  if (result.value) router.push(`/a/${result.value.album_id}`)
}

function reset() {
  result.value = null
  photos.value = []
  selectedId.value = ''
  step.value = 1
  form.author = ''
  form.partner = ''
  form.met_at = ''
  form.message = ''
}
</script>

<template>
  <div class="cv">
    <BgDecor />

    <div class="cv-wrap">
      <!-- ------------------------------------------------------------ 头部 -->
      <header class="cv-head">
        <div class="cv-brand">
          <i class="cv-heart" aria-hidden="true">♥</i>
          <span>回忆录生成器</span>
        </div>
        <div v-if="!result" class="cv-steps" aria-hidden="true">
          <i v-for="n in 3" :key="n" :class="{ on: step >= n, cur: step === n }"></i>
        </div>
      </header>

      <!-- ------------------------------------------------------------ 主体 -->
      <div class="cv-body">
        <!-- ============ 步骤 1：你们 ============ -->
        <section v-if="step === 1" class="card glass">
          <h2 class="card-title">先说说你们</h2>
          <p class="card-hint">只填想填的，其它留空也没关系。</p>

          <label class="field">
            <span class="field-label">回忆录标题</span>
            <input v-model="form.title" class="input" maxlength="30" placeholder="我们的恋爱回忆录" />
          </label>

          <div class="row">
            <label class="field">
              <span class="field-label">你的名字</span>
              <input v-model="form.author" class="input" maxlength="20" placeholder="你的名字" />
            </label>
            <label class="field">
              <span class="field-label">TA 的名字</span>
              <input v-model="form.partner" class="input" maxlength="20" placeholder="TA 的名字" />
            </label>
          </div>

          <label class="field">
            <span class="field-label">相识的那天</span>
            <input v-model="form.met_at" class="input" maxlength="20" placeholder="2024.10.10" />
          </label>

          <label class="field">
            <span class="field-label">最后想对 TA 说的那句话</span>
            <input
              v-model="form.ending_line"
              class="input"
              maxlength="60"
              placeholder="遇见你，是我最幸运的事。"
            />
          </label>
        </section>

        <!-- ============ 步骤 2：照片 ============ -->
        <section v-else-if="step === 2" class="card glass">
          <h2 class="card-title">放几张照片</h2>
          <p class="card-hint">最多 20 张，会按这个顺序播成一段卡点短片。点一张可以给它配句话。</p>

          <button type="button" class="picker" @click="openPicker">
            <span class="picker-plus" aria-hidden="true">＋</span>
            <span>{{ photos.length ? `还能再选 ${MAX_PHOTOS - photos.length} 张` : '从相册选择' }}</span>
          </button>
          <input
            ref="fileInput"
            class="sr-only"
            type="file"
            accept="image/*"
            multiple
            @change="onFiles"
          />

          <p v-if="picking" class="card-hint">正在压缩照片…</p>

          <div v-if="photos.length" class="grid">
            <button
              v-for="(photo, index) in photos"
              :key="photo.id"
              type="button"
              class="thumb"
              :class="{ 'is-sel': photo.id === selectedId }"
              @click="selectedId = photo.id"
            >
              <img :src="photo.dataURL" alt="" />
              <span class="thumb-no">{{ index + 1 }}</span>
              <span class="thumb-del" @click.stop="removePhoto(photo.id)">×</span>
            </button>
          </div>

          <div v-if="selected" class="cap">
            <div class="cap-head">
              <span>第 {{ photos.indexOf(selected) + 1 }} 张的字幕</span>
              <span class="cap-ops">
                <button type="button" @click="movePhoto(-1)">前移</button>
                <button type="button" @click="movePhoto(1)">后移</button>
              </span>
            </div>
            <input
              v-model="selected.caption"
              class="input"
              maxlength="60"
              placeholder="例如：那天我们第一次一起看海"
            />
          </div>

          <p class="card-hint">
            已选 {{ photos.length }} / {{ MAX_PHOTOS }} 张 · 约 {{ totalMb }} MB
          </p>
        </section>

        <!-- ============ 步骤 3：确认并生成 ============ -->
        <section v-else class="card glass">
          <h2 class="card-title">就这样吧</h2>
          <dl class="summary">
            <div>
              <dt>标题</dt>
              <dd>{{ form.title }}</dd>
            </div>
            <div v-if="form.partner || form.author">
              <dt>你们</dt>
              <dd>{{ form.author || '我' }} + {{ form.partner || 'TA' }}</dd>
            </div>
            <div v-if="form.met_at">
              <dt>相识</dt>
              <dd>{{ form.met_at }}</dd>
            </div>
            <div>
              <dt>照片</dt>
              <dd>{{ photos.length }} 张 · 约 {{ Math.round(photos.length * 1.5) }} 秒</dd>
            </div>
          </dl>

          <label class="field">
            <span class="field-label">想在最后多说一句（可不填）</span>
            <input v-model="form.message" class="input" maxlength="200" placeholder="比如：以后也要一起去很多地方" />
          </label>

          <div v-if="uploading" class="bar" role="progressbar" :aria-valuenow="Math.round(progress * 100)">
            <i :style="{ width: `${Math.round(progress * 100)}%` }"></i>
          </div>
          <p v-if="errorText" class="err">{{ errorText }}</p>
        </section>

        <!-- ============ 完成 ============ -->
        <section v-if="result" class="card glass">
          <p class="ok-mark" aria-hidden="true">♥</p>
          <h2 class="card-title">做好啦</h2>
          <p class="card-hint">把这个链接发给 TA，点开就能看。</p>
          <p class="link-box">{{ result.share_url }}</p>
          <p v-if="errorText" class="err">{{ errorText }}</p>
        </section>
      </div>

      <!-- ------------------------------------------------------------ 底部按钮 -->
      <footer class="cv-foot" :class="{ 'is-result': result }">
        <template v-if="result">
          <GlassButton block @click="copyLink">复制链接</GlassButton>
          <div class="cv-foot-row">
            <GlassButton block variant="ghost" @click="preview">先自己看一遍</GlassButton>
            <GlassButton block variant="ghost" @click="reset">再做一份</GlassButton>
          </div>
        </template>
        <template v-else>
          <GlassButton v-if="step > 1" variant="ghost" @click="back">上一步</GlassButton>
          <GlassButton v-if="step < 3" block @click="next">下一步</GlassButton>
          <GlassButton v-else block @click="submit">
            {{ uploading ? `正在生成 ${Math.round(progress * 100)}%` : '生成我的回忆录' }}
          </GlassButton>
        </template>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.cv {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.cv-wrap {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: calc(env(safe-area-inset-top, 0px) + 14px) 18px
    calc(env(safe-area-inset-bottom, 0px) + 14px);
}

/* ------------------------------------------------------------------ 头部 */
.cv-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.cv-brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  letter-spacing: 0.6px;
  color: var(--c-ink-soft);
}
.cv-heart {
  font-style: normal;
  font-size: 14px;
  color: var(--c-rose-deep);
}
.cv-steps {
  display: flex;
  gap: 5px;
}
.cv-steps i {
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.5);
  transition: background 0.3s ease;
}
.cv-steps i.on {
  background: linear-gradient(90deg, var(--c-gold-deep), var(--c-rose-deep));
}

/* ------------------------------------------------------------------ 主体 */
.cv-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
}
.cv-body::-webkit-scrollbar {
  display: none;
}

.card {
  padding: 20px 18px;
  border-radius: 24px;
}
.card-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: #6d4a52;
}
.card-hint {
  margin: 0 0 16px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--c-ink-soft);
}

/* ------------------------------------------------------------------ 表单 */
.field {
  display: block;
  margin-bottom: 14px;
}
.field-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  letter-spacing: 0.4px;
  color: var(--c-ink-soft);
}
.input {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.75);
  background: rgba(255, 255, 255, 0.55);
  font-size: 15px;
  color: var(--c-ink);
  outline: none;
  transition: border-color 0.2s ease, background 0.2s ease;
  /* 手机上字号 < 16px 时 iOS 会自动放大页面，15px + 这个属性压住 */
  -webkit-text-size-adjust: 100%;
}
.input:focus {
  border-color: rgba(201, 138, 155, 0.85);
  background: rgba(255, 255, 255, 0.82);
}
.input::placeholder {
  color: rgba(120, 92, 100, 0.42);
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

/* ------------------------------------------------------------------ 选图 */
.picker {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 16px;
  margin-bottom: 14px;
  border-radius: 18px;
  border: 1.5px dashed rgba(201, 138, 155, 0.55);
  background: rgba(255, 255, 255, 0.42);
  font-size: 14px;
  color: #8a5f6b;
  transition: transform 0.18s var(--ease-spring), background 0.2s ease;
}
.picker:active {
  transform: scale(0.96);
  background: rgba(255, 255, 255, 0.7);
}
.picker-plus {
  font-size: 18px;
  line-height: 1;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.thumb {
  position: relative;
  aspect-ratio: 3 / 4;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.4);
  transition: transform 0.18s var(--ease-spring);
}
.thumb:active {
  transform: scale(0.96);
}
.thumb.is-sel {
  box-shadow: 0 0 0 2.5px var(--c-rose-deep);
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.thumb-no {
  position: absolute;
  left: 5px;
  bottom: 5px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 9px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
}
.thumb-del {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 14px;
  line-height: 21px;
  text-align: center;
}

.cap {
  padding: 12px 14px;
  margin-bottom: 12px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.42);
}
.cap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--c-ink-soft);
}
.cap-ops button {
  margin-left: 8px;
  padding: 4px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.6);
  font-size: 11.5px;
  color: #8a5f6b;
  transition: transform 0.16s var(--ease-spring);
}
.cap-ops button:active {
  transform: scale(0.94);
}

/* ------------------------------------------------------------------ 确认 */
.summary {
  margin: 0 0 14px;
  font-size: 13.5px;
}
.summary > div {
  display: flex;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
}
.summary dt {
  flex: none;
  width: 44px;
  color: var(--c-ink-soft);
}
.summary dd {
  margin: 0;
  flex: 1;
  color: var(--c-ink);
}

/* 上传进度 */
.bar {
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.55);
  margin-top: 6px;
}
.bar i {
  display: block;
  height: 100%;
  width: 0;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--c-gold-deep), var(--c-rose-deep));
  transition: width 0.25s ease;
}

.err {
  margin: 12px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: #b5525f;
}

/* ------------------------------------------------------------------ 结果 */
.ok-mark {
  margin: 0 0 2px;
  font-size: 26px;
  text-align: center;
  color: var(--c-rose-deep);
  animation: pop 0.5s var(--ease-spring) both;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.link-box {
  margin: 0 0 6px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  font-size: 12.5px;
  line-height: 1.5;
  color: #6d4a52;
  word-break: break-all;
  user-select: all;
}

/* ------------------------------------------------------------------ 底部 */
.cv-foot {
  flex: none;
  display: flex;
  gap: 10px;
  padding-top: 12px;
}
.cv-foot > :deep(button) {
  flex: 1;
}
/* 结果页：三个按钮一行会挤到断行（"复制链 接"），所以主按钮独占一行、次按钮两两并排 */
.cv-foot.is-result {
  flex-direction: column;
}
.cv-foot-row {
  display: flex;
  gap: 10px;
}
.cv-foot-row > :deep(button) {
  flex: 1;
  font-size: 14px;
}
</style>
