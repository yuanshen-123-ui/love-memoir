/**
 * ============================================================================
 *  localStorage 封装
 *  ---------------------------------------------------------------------------
 *  两个坑：
 *    1. 在某些环境里「访问 localStorage 本身」就会抛异常
 *       （iOS 无痕模式、微信里被清理过的 WebView、部分 App 内嵌页），
 *       所以连 window.localStorage 都要包 try/catch，并准备内存兜底。
 *    2. 写入可能 QuotaExceededError（配额满），必须能被上层捕获并提示用户。
 * ========================================================================== */

const KEY_PHOTO = 'love-memoir:photo'

/** 探测一次可用的存储；不可用则退化成内存 Map（本次会话有效） */
const store = (() => {
  try {
    const probe = '__love_memoir_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch (err) {
    console.warn('[love-memoir] localStorage 不可用，本次会话降级为内存存储', err)
    const mem = new Map()
    return {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, v),
      removeItem: (k) => mem.delete(k),
    }
  }
})()

/** 读取上次存的照片（没有就返回 null） */
export function loadPhoto() {
  try {
    const v = store.getItem(KEY_PHOTO)
    // 只认 dataURL，避免历史脏数据把 <img> 搞挂
    return v && v.startsWith('data:image/') ? v : null
  } catch {
    return null
  }
}

/**
 * 保存照片
 * @returns {{ok: true} | {ok: false, reason: 'QUOTA' | 'UNKNOWN'}}
 */
export function savePhoto(dataURL) {
  try {
    store.setItem(KEY_PHOTO, dataURL)
    return { ok: true }
  } catch (err) {
    // QuotaExceededError / NS_ERROR_DOM_QUOTA_REACHED
    const quota =
      err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22)
    return { ok: false, reason: quota ? 'QUOTA' : 'UNKNOWN' }
  }
}

/** 清掉照片（换一张时用） */
export function clearPhoto() {
  try {
    store.removeItem(KEY_PHOTO)
  } catch {
    /* 忽略 */
  }
}
