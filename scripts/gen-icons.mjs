/**
 * ============================================================================
 *  生成图标与分享预览图（纯 Node，不依赖任何图形库）
 *  ---------------------------------------------------------------------------
 *  为什么要自己写：
 *    为了一个 favicon 去装 sharp / canvas / playwright 都太重（几十 MB 的原生依赖，
 *    还会让 CI 变慢）。而这两张图本质上就是「渐变背景 + 一个心形」，
 *    用数学公式逐像素算出来 + 手写一段 PNG 编码（zlib 是 Node 内置的）就够。
 *
 *  心形用的是隐式方程：(x² + y² − 1)³ − x²y³ ≤ 0    ——  判定「点在心里面」
 *  超采样 2×2 抗锯齿，所以边缘是平滑的。
 *
 *  用法：node scripts/gen-icons.mjs
 *  产物：
 *    public/icons/icon-180.png   Apple 主屏图标
 *    public/icons/icon-192.png   PWA / Android
 *    public/icons/icon-512.png   PWA 大图
 *    public/og.png               微信/社交分享预览（1200×630）
 * ========================================================================== */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ----------------------------------------------------------- PNG 编码 */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** RGBA 像素缓冲 → PNG（8bit、真彩+alpha、逐行 filter=0） */
function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter type 0 = None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ------------------------------------------------------------ 绘制 */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a, b, t) => a + (b - a) * t

/** 心形隐式函数：<= 0 表示在心的内部（y 轴向上） */
function heartField(x, y) {
  const a = x * x + y * y - 1
  return a * a * a - x * x * y * y * y
}

/**
 * 画一张图
 * @param {number} w
 * @param {number} h
 * @param {number} heartScale 心形大小（1 = 正好占满短边）
 * @param {boolean} rounded 是否做圆角遮罩（iOS 主屏图标系统会自动切圆角，
 *                          这里只在 OG 图上用圆角）
 */
function render(w, h, { heartScale = 1.16, rounded = false } = {}) {
  const SS = 2 // 2×2 超采样
  const out = Buffer.alloc(w * h * 4)
  const minSide = Math.min(w, h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / w
          const v = (y + (sy + 0.5) / SS) / h

          // ---- 背景：香槟金 → 冷玫瑰 的对角渐变
          const t = clamp01((u + v) / 2)
          let cr = lerp(249, 233, t)
          let cg = lerp(236, 190, t)
          let cb = lerp(214, 202, t)

          // ---- 左上角一团暖光
          const glow = clamp01(1 - Math.hypot(u - 0.12, v - 0.08) / 0.75)
          cr += glow * 10
          cg += glow * 12
          cb += glow * 8

          // ---- 心形坐标（把短边映射成 [-1,1]，y 轴翻转）
          // 注意是「乘」heartScale：心形本身占满 [-1,1]²，
          // 乘 1.2 意味着画布边缘对应心形的 1.2 倍处 → 心只占画面的 1/1.2 ≈ 83%
          const cx = ((u - 0.5) * 2 * (w / minSide) * heartScale)
          const cy = ((0.5 - v) * 2 * (h / minSide) * heartScale)

          // 投影：心往下偏移一点，先铺一层深色
          if (heartField(cx, cy + 0.055) <= 0) {
            cr = cr * 0.86
            cg = cg * 0.82
            cb = cb * 0.84
          }

          // 心本体
          if (heartField(cx, cy) <= 0) {
            // 主体接近暖白，靠上更亮一点，做出一点体积
            const lift = clamp01(0.5 - cy * 0.35)
            cr = lerp(253, 255, lift)
            cg = lerp(243, 252, lift)
            cb = lerp(232, 245, lift)
          }

          r += cr
          g += cg
          b += cb
        }
      }

      const n = SS * SS
      r /= n
      g /= n
      b /= n

      // 圆角遮罩（可选）
      let alpha = 255
      if (rounded) {
        const rr = minSide * 0.22
        const dx = Math.max(0, Math.abs(x - w / 2) - (w / 2 - rr))
        const dy = Math.max(0, Math.abs(y - h / 2) - (h / 2 - rr))
        if (Math.hypot(dx, dy) > rr) alpha = 0
      }

      const i = (y * w + x) * 4
      out[i] = Math.round(clamp01(r / 255) * 255)
      out[i + 1] = Math.round(clamp01(g / 255) * 255)
      out[i + 2] = Math.round(clamp01(b / 255) * 255)
      out[i + 3] = alpha
    }
  }

  return encodePng(w, h, out)
}

/* ------------------------------------------------------------ 输出 */
mkdirSync(resolve(ROOT, 'public/icons'), { recursive: true })

const targets = [
  { file: 'public/icons/icon-180.png', w: 180, h: 180, opt: { heartScale: 1.32 } },
  { file: 'public/icons/icon-192.png', w: 192, h: 192, opt: { heartScale: 1.32 } },
  { file: 'public/icons/icon-512.png', w: 512, h: 512, opt: { heartScale: 1.32 } },
  { file: 'public/og.png', w: 1200, h: 630, opt: { heartScale: 1.75, rounded: true } },
]

for (const t of targets) {
  const png = render(t.w, t.h, t.opt)
  const full = resolve(ROOT, t.file)
  writeFileSync(full, png)
  console.log(`✓ ${t.file}  ${t.w}×${t.h}  ${(png.length / 1024).toFixed(1)}KB`)
}
