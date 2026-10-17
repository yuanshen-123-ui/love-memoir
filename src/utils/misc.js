/**
 * 极轻量的触觉反馈。
 * iOS Safari 不支持 navigator.vibrate（会静默失败），所以只是安卓上的加分项，
 * 拿不到就安静跳过，绝不能因为震动抛错打断流程。
 */
export function vibrate(pattern = 8) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    /* 忽略：部分浏览器在无用户手势时会拒绝 */
  }
}

/** 从数组里随机取一个 */
export function pickOne(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  return list[Math.floor(Math.random() * list.length)]
}

/** 限制在 [min, max] */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}
