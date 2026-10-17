/**
 * ============================================================================
 *  分享海报：用 Canvas 把「照片 + 那句话 + 日期」画成一张 750×1200 的卡片
 *  ---------------------------------------------------------------------------
 *  为什么值得做：
 *    微信里最自然的保存方式就是「长按图片 → 保存到相册」。给一张排好版的海报，
 *    比让她自己截屏（带状态栏、带边框）体面得多。
 *
 *  实现要点：
 *    · 全部用 2D 矢量绘制，不用任何外部素材和图片合成库
 *    · 照片用「cover 裁剪」铺满相框，不会被拉变形
 *    · 中文长句按字符逐个 measureText 折行（中文没有空格可断，不能简单按空格切）
 *    · 输出 JPEG 0.92、750px 宽 —— 微信压缩后依然清晰，体积约 200~400KB
 * ========================================================================== */

export const POSTER_W = 750
export const POSTER_H = 1200

/** 系统字体栈：canvas 里只能用字符串，iOS 命中苹方，安卓落到思源黑体 */
const FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Helvetica Neue", sans-serif'
const SERIF = '"Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif'

/** 圆角矩形路径（老内核没有 ctx.roundRect，手工画最稳） */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

/** 把图片按 cover 方式画进矩形（居中裁剪，不变形） */
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const scale = Math.max(w / iw, h / ih)
  const dw = iw * scale
  const dh = ih * scale
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
}

/** 按像素宽度折行（中文按字切，英文尽量按空格切） */
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of Array.from(String(text || ''))) {
    const next = line + ch
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** 画一个小爱心（用两个圆 + 一个三角形，比路径写法短） */
function drawHeart(ctx, cx, cy, size, color) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  const s = size / 2
  ctx.moveTo(cx, cy + s * 0.9)
  ctx.bezierCurveTo(cx - s * 1.4, cy - s * 0.3, cx - s * 0.5, cy - s * 1.1, cx, cy - s * 0.35)
  ctx.bezierCurveTo(cx + s * 0.5, cy - s * 1.1, cx + s * 1.4, cy - s * 0.3, cx, cy + s * 0.9)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('POSTER_IMAGE_FAIL'))
    img.src = src
  })
}

/**
 * 生成海报
 * @param {object} opts
 * @param {string} opts.photo 照片 dataURL（可为空，空则画一个爱心占位）
 * @param {object} opts.copy 文案（见 config.poster）
 * @returns {Promise<string>} JPEG dataURL
 */
export async function renderPoster({ photo, copy = {} }) {
  const canvas = document.createElement('canvas')
  canvas.width = POSTER_W
  canvas.height = POSTER_H
  const ctx = canvas.getContext('2d')

  /* ---------------------------------------------------------------- 背景 */
  const bg = ctx.createLinearGradient(0, 0, POSTER_W, POSTER_H)
  bg.addColorStop(0, '#f9ecd7')
  bg.addColorStop(0.45, '#f7e2e5')
  bg.addColorStop(1, '#e9c8d6')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, POSTER_W, POSTER_H)

  // 两团柔光，避免大面积纯渐变显得平
  const blobs = [
    { x: 0.15, y: 0.08, r: 0.55, c: 'rgba(255,240,205,0.75)' },
    { x: 0.9, y: 0.75, r: 0.6, c: 'rgba(246,203,219,0.7)' },
  ]
  for (const b of blobs) {
    const g = ctx.createRadialGradient(
      POSTER_W * b.x,
      POSTER_H * b.y,
      0,
      POSTER_W * b.x,
      POSTER_H * b.y,
      POSTER_W * b.r,
    )
    g.addColorStop(0, b.c)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, POSTER_W, POSTER_H)
  }

  /* -------------------------------------------------------------- 卡片 */
  const cardX = 56
  const cardY = 108
  const cardW = POSTER_W - cardX * 2
  const cardH = 900

  ctx.save()
  ctx.shadowColor = 'rgba(150,95,115,0.22)'
  ctx.shadowBlur = 40
  ctx.shadowOffsetY = 14
  ctx.fillStyle = 'rgba(255,255,255,0.74)'
  roundRect(ctx, cardX, cardY, cardW, cardH, 40)
  ctx.fill()
  ctx.restore()

  // 卡片描边（高光感）
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.5
  roundRect(ctx, cardX + 0.75, cardY + 0.75, cardW - 1.5, cardH - 1.5, 40)
  ctx.stroke()

  /* ------------------------------------------------------------ 小标题 */
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(122,84,96,0.55)'
  ctx.font = `500 24px ${FONT}`
  ctx.fillText(copy.badge || '我们的恋爱回忆录', POSTER_W / 2, cardY + 62)

  /* -------------------------------------------------------------- 照片 */
  const photoX = cardX + 38
  const photoY = cardY + 106
  const photoW = cardW - 76
  const photoH = 404

  ctx.save()
  roundRect(ctx, photoX, photoY, photoW, photoH, 26)
  ctx.clip()
  if (photo) {
    try {
      const img = await loadImage(photo)
      drawCover(ctx, img, photoX, photoY, photoW, photoH)
    } catch {
      paintPhotoFallback(ctx, photoX, photoY, photoW, photoH)
    }
  } else {
    paintPhotoFallback(ctx, photoX, photoY, photoW, photoH)
  }
  // 照片内阴影，边不会「浮」在卡片上
  ctx.shadowColor = 'rgba(110,62,74,0.28)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = -8
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  roundRect(ctx, photoX + 1, photoY + 1, photoW - 2, photoH - 2, 25)
  ctx.stroke()
  ctx.restore()

  /* -------------------------------------------------------------- 那句话 */
  const lineY = photoY + photoH + 92
  ctx.fillStyle = '#4a363c'
  ctx.font = `600 40px ${SERIF}`
  const lines = wrapText(ctx, copy.line || '遇见你，是我最幸运的事。', cardW - 96).slice(0, 2)
  lines.forEach((l, i) => {
    ctx.fillText(l, POSTER_W / 2, lineY + i * 58)
  })

  /* ------------------------------------------------------- 装饰小爱心 */
  const heartY = lineY + (lines.length > 1 ? 100 : 62)
  drawHeart(ctx, POSTER_W / 2 - 26, heartY, 16, 'rgba(214,146,160,0.75)')
  drawHeart(ctx, POSTER_W / 2 + 26, heartY, 16, 'rgba(214,146,160,0.45)')

  /* -------------------------------------------------------------- 日期 */
  ctx.fillStyle = 'rgba(90,62,70,0.62)'
  ctx.font = `400 26px ${FONT}`
  ctx.fillText(copy.subline || '', POSTER_W / 2, heartY + 62)

  /* ------------------------------------------------------- 卡片底部签名 */
  ctx.strokeStyle = 'rgba(160,118,130,0.24)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(POSTER_W / 2 - 90, cardY + cardH - 92)
  ctx.lineTo(POSTER_W / 2 + 90, cardY + cardH - 92)
  ctx.stroke()

  ctx.fillStyle = 'rgba(122,84,96,0.5)'
  ctx.font = `400 22px ${FONT}`
  ctx.fillText(copy.footer || 'love.ccflysim.cn', POSTER_W / 2, cardY + cardH - 56)

  /* ---------------------------------------------------- 卡片外的点缀 */
  drawHeart(ctx, 96, 1052, 22, 'rgba(255,255,255,0.55)')
  drawHeart(ctx, POSTER_W - 96, 1052, 22, 'rgba(255,255,255,0.55)')
  ctx.fillStyle = 'rgba(90,62,70,0.42)'
  ctx.font = `400 22px ${FONT}`
  ctx.fillText(copy.tip || '长按图片，存到相册', POSTER_W / 2, 1062)

  return canvas.toDataURL('image/jpeg', 0.92)
}

/** 没有照片时画一块暖色 + 爱心，保证海报永远能出图 */
function paintPhotoFallback(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, '#fbe9cf')
  g.addColorStop(1, '#efc9d6')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  drawHeart(ctx, x + w / 2, y + h / 2, 90, 'rgba(255,255,255,0.55)')
}
