/**
 * ============================================================================
 *  localStorage 封装
 *  ---------------------------------------------------------------------------
 *  三个坑：
 *    1. 在某些环境里「访问 localStorage 本身」就会抛异常
 *       （iOS 无痕模式、微信里被清理过的 WebView、部分 App 内嵌页），
 *       所以连 window.localStorage 都要包 try/catch，并准备内存兜底。
 *    2. 写入可能 QuotaExceededError（配额满），必须能被上层捕获并提示用户。
 *    3. 存进去的是字符串，读出来可能是历史脏数据（比如半截 JSON），
 *       所有读取都要能安全降级，绝不能因为一条脏数据让整个页面白屏。
 * ========================================================================== */

const KEY_PHOTO = 'love-memoir:photo'
const KEY_PROGRESS = 'love-memoir:progress'
const KEY_SOUND = 'love-memoir:sound'

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

/* -------------------------------------------------------------- 照片 */

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
      err &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22)
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

/* ------------------------------------------------------------ 进度 */

/** 可恢复的阶段白名单（不能恢复 upload / start，那两个由有没有照片决定） */
const RESUMABLE = new Set(['level1', 'level2', 'level3', 'ending'])

/**
 * 保存当前进度。意义：她在第 2 关不小心把微信下拉刷新了，
 * 重进不该从头再来一遍。
 */
export function saveProgress(stage) {
  try {
    if (!stage) return
    store.setItem(KEY_PROGRESS, JSON.stringify({ stage, at: Date.now() }))
  } catch {
    /* 存不下就算了，不影响主流程 */
  }
}

/** 读取进度，返回合法 stage 或 null */
export function loadProgress() {
  try {
    const raw = store.getItem(KEY_PROGRESS)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && RESUMABLE.has(parsed.stage) ? parsed.stage : null
  } catch {
    return null
  }
}

/** 清掉进度（重新开始 / 结局之后） */
export function clearProgress() {
  try {
    store.removeItem(KEY_PROGRESS)
  } catch {
    /* 忽略 */
  }
}

/* ----------------------------------------------------------- 声音偏好 */

/** 声音是否开启（默认开启：这是要发给对象的，音乐是体验的一部分） */
export function loadSoundPref() {
  try {
    const v = store.getItem(KEY_SOUND)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

export function saveSoundPref(enabled) {
  try {
    store.setItem(KEY_SOUND, enabled ? '1' : '0')
  } catch {
    /* 忽略 */
  }
}

/* -------------------------------------------------------------- 清空 */

/** 清空本站写入的所有数据（「重新开始」用） */
export function clearAll() {
  clearPhoto()
  clearProgress()
}
