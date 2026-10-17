/**
 * ============================================================================
 *  图片压缩：手机相册原图（常见 3000×4000、3~8MB）
 *  → 长边 ≤ 800px 的 JPEG Base64（通常 80~200KB）
 *  ---------------------------------------------------------------------------
 *  为什么必须压到这么狠：
 *    localStorage 大多数浏览器只有 5MB，而 Base64 比二进制还要再大 1/3。
 *    一张原图不压缩直接存，大概率 QuotaExceededError，整个流程直接死掉。
 *
 *  为什么用 createImageBitmap：
 *    iPhone 竖拍的照片实际像素是横的，靠 EXIF Orientation 标记来「转正」。
 *    如果只用 <img> + canvas 手绘，不做 EXIF 处理，照片会躺倒 90°。
 *    createImageBitmap(file, { imageOrientation: 'from-image' }) 会直接给出
 *    已经摆正好的位图，省掉自己解析 EXIF 的一整套逻辑。
 *
 *  为什么用 JPEG 而不是 WebP/PNG：
 *    微信 X5 老内核 canvas.toDataURL('image/webp') 支持不一致（可能静默返回 PNG），
 *    JPEG 是唯一全平台稳的格式。透明背景会变黑，所以先铺一层暖白。
 * ========================================================================== */

/** 图片压缩的默认参数（想改清晰度/体积就调这里） */
export const COMPRESS_DEFAULTS = {
  maxSize: 800, // 长边最大像素
  quality: 0.8, // JPEG 质量
  maxBytes: 900 * 1024, // Base64 字符串长度上限（约 675KB 原始数据）
}

/**
 * 把 File 对象压成 Base64 dataURL
 * @param {File} file 用户从相册选的文件
 * @param {object} options 见 COMPRESS_DEFAULTS
 * @returns {Promise<{dataURL:string, width:number, height:number, bytes:number}>}
 */
export async function compressImage(file, options = {}) {
  const { maxSize, quality, maxBytes } = { ...COMPRESS_DEFAULTS, ...options }

  if (!file) throw new Error('NO_FILE')
  if (file.type && !file.type.startsWith('image/')) throw new Error('NOT_IMAGE')

  const decoded = await decodeImage(file)

  try {
    const { source, width, height } = decoded

    // 第一轮：按目标尺寸 + 目标质量压
    let dataURL = drawToJpeg(source, width, height, maxSize, quality)

    // 第二轮：还超预算就逐步降质量（绝大多数情况走不到这里）
    if (dataURL.length > maxBytes) {
      for (const q of [0.7, 0.62, 0.55]) {
        dataURL = drawToJpeg(source, width, height, maxSize, q)
        if (dataURL.length <= maxBytes) break
      }
    }
    // 第三轮：还超就再缩尺寸（极端长图）
    if (dataURL.length > maxBytes) {
      dataURL = drawToJpeg(source, width, height, Math.round(maxSize * 0.75), 0.6)
    }

    return {
      dataURL,
      width: Math.round(width),
      height: Math.round(height),
      /** 估算真实字节数：Base64 每 4 个字符代表 3 字节 */
      bytes: Math.round((dataURL.length - dataURL.indexOf(',') - 1) * 0.75),
    }
  } finally {
    decoded.release()
  }
}

/**
 * 解码成位图。返回 { source, width, height, release }
 * release 必须调用，否则 <img> 兜底那条路的 ObjectURL 会泄漏。
 */
async function decodeImage(file) {
  // ① 首选 createImageBitmap：自带 EXIF 转正，且不占 DOM
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close && bitmap.close(),
      }
    } catch {
      // 老 Safari 不认第二个参数，或者解码失败 → 走 ②
    }
  }

  // ② <img> 兜底：现代浏览器对 <img> 默认已按 EXIF 渲染（image-orientation: from-image）
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('DECODE_FAIL'))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      release: () => URL.revokeObjectURL(url),
    }
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}

/**
 * 一次 canvas 绘制 → JPEG Base64
 * 注意：canvas 尺寸按缩放后的实际像素开，不要开成原图尺寸再缩小 —— 那样内存直接爆。
 */
function drawToJpeg(source, srcW, srcH, maxSize, quality) {
  const scale = Math.min(1, maxSize / Math.max(srcW, srcH))
  const w = Math.max(1, Math.round(srcW * scale))
  const h = Math.max(1, Math.round(srcH * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext('2d')
  // 关掉 alpha，绘制更快；同时保证 JPEG 不会有黑底
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // PNG 的透明区域转 JPEG 会变黑 → 先铺一层和主题一致的暖白
  ctx.fillStyle = '#fffaf7'
  ctx.fillRect(0, 0, w, h)

  ctx.drawImage(source, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
