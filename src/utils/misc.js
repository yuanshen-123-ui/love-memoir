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

/** 限制在 [min, max]（保留在这里，方便业务代码只 import 一个工具模块） */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}
