/**
 * 后端接口封装
 * ---------------------------------------------------------------------------
 * 生产环境前后端同域（nginx 反代 /api），所以 API_BASE 留空即可；
 * 本地开发走 vite 的 proxy（见 vite.config.js），也不用手动配地址。
 * 想指向别的后端，就在 .env 里写 VITE_API_BASE=https://xxx
 */

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

/** dataURL → Blob（上传要二进制，不能传 base64 字符串） */
export function dataURLToBlob(dataURL) {
  const [head, body] = dataURL.split(',')
  const mime = /:(.*?);/.exec(head)?.[1] || 'image/jpeg'
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

function errorFrom(status, text) {
  let detail = ''
  try {
    const parsed = JSON.parse(text)
    detail = typeof parsed.detail === 'string' ? parsed.detail : ''
  } catch {
    /* 不是 JSON 就算了 */
  }
  if (detail) return new Error(detail)
  if (status === 429) return new Error('上传太频繁了，歇一会儿再试')
  if (status === 413) return new Error('照片太大了，换小一点的试试')
  if (status >= 500) return new Error('服务器打了个盹，稍后再试')
  return new Error(`上传失败（${status}）`)
}

/**
 * 创建回忆录
 * @param {object} payload 文案配置（AlbumPayload）
 * @param {Array<{dataURL:string}>} photos 照片（按顺序）
 * @param {(ratio:number)=>void} onProgress 上传进度 0~1
 * @returns {Promise<{album_id:string, share_url:string, photos:Array}>}
 *
 * 用 XMLHttpRequest 而不是 fetch：fetch 至今没有上传进度事件，
 * 20 张照片在弱网下要等十几秒，没有进度条用户会以为卡死了。
 */
export function createAlbum(payload, photos, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('payload', JSON.stringify(payload))
    photos.forEach((photo, index) => {
      form.append('photos', dataURLToBlob(photo.dataURL), `photo-${index + 1}.jpg`)
    })

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/upload`)
    xhr.timeout = 180000

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText))
        } catch {
          reject(new Error('服务器返回了奇怪的东西'))
        }
      } else {
        reject(errorFrom(xhr.status, xhr.responseText))
      }
    }
    xhr.onerror = () => reject(new Error('网络好像不太行，检查一下再试'))
    xhr.ontimeout = () => reject(new Error('上传超时了，照片多的话换个网络试试'))
    xhr.send(form)
  })
}

/** 读取一份回忆录（GET /api/album/{id}） */
export async function getAlbum(albumId) {
  let res
  try {
    res = await fetch(`${API_BASE}/api/album/${encodeURIComponent(albumId)}`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new Error('网络好像不太行')
  }
  if (res.status === 404) throw new Error('这份回忆录不存在，或者链接被改过')
  if (!res.ok) throw errorFrom(res.status, await res.text().catch(() => ''))
  return res.json()
}
