/**
 * MontagePlayer 的独立预览 harness（只用于 vite dev，不进构建产物）
 * ---------------------------------------------------------------------------
 * 干三件事：
 *   1. 用 canvas 现场生成 20 张 600×900 的 base64 照片（模拟前端压缩后的真机照片）
 *   2. 挂载播放器，把 ended 次数 / 时间挂到 window.__harness 供自动化验收断言
 *   3. 提供 toggle 按钮做「卸载 → 再挂载」，用来验证内存有没有清干净
 */
import { createApp, h, ref } from 'vue'
import MontagePlayer from '../src/components/MontagePlayer.vue'

const q = new URLSearchParams(location.search)
const slotMs = Number(q.get('slot') || 1500)
const fadeMs = Number(q.get('fade') || 600)
/** tone=site（默认，与页面同底色）/ dark（纯黑） */
const tone = q.get('tone') || 'site'

function makePhotos(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 900
    const x = c.getContext('2d')
    const g = x.createLinearGradient(0, 0, 600, 900)
    g.addColorStop(0, `hsl(${(i * 37) % 360}, 68%, 62%)`)
    g.addColorStop(1, `hsl(${(i * 37 + 48) % 360}, 58%, 34%)`)
    x.fillStyle = g
    x.fillRect(0, 0, 600, 900)
    x.fillStyle = 'rgba(255,255,255,0.9)'
    x.font = 'bold 140px sans-serif'
    x.textAlign = 'center'
    x.fillText(String(i + 1), 300, 480)
    out.push(c.toDataURL('image/jpeg', 0.82))
  }
  return out
}

const photos = makePhotos(20)
const lines = photos.map((_, i) => `${2021 + Math.floor(i / 4)}年 · 第 ${i + 1} 次心动`)

const endedCount = ref(0)
const showMontage = ref(true)

window.__harness = {
  endedCount,
  showMontage,
  photos,
  startedAt: performance.now(),
  endedAt: 0,
  get ended() {
    return endedCount.value
  },
}

createApp({
  setup() {
    return () =>
      h('div', { style: 'height:100%' }, [
        h(
          'button',
          {
            id: 'toggle',
            class: 'harness-btn',
            onClick: () => {
              showMontage.value = !showMontage.value
            },
          },
          'toggle',
        ),
        showMontage.value
          ? h(MontagePlayer, {
              photos,
              lines,
              slotMs,
              fadeMs,
              tone,
              onEnded: () => {
                endedCount.value += 1
                if (!window.__harness.endedAt) window.__harness.endedAt = performance.now()
              },
            })
          : null,
      ])
  },
}).mount('#app')
