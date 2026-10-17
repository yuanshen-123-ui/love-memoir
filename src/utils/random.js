/**
 * ============================================================================
 *  可复现的伪随机数
 *  ---------------------------------------------------------------------------
 *  为什么要「可复现」：
 *    爱心雨的落点、星星的闪烁节奏这类装饰参数，如果每次刷新都不同，
 *    调样式时就没法对照；而且同一轮动画里参数要稳定（不能一帧一变）。
 *    用固定 seed 的线性同余发生器（LCG）就能做到「同 seed 同序列」。
 *
 *  为什么不用 Math.random：
 *    Math.random 不可复现，也无法在单元测试里断言。
 *    这里的 LCG 只用整数乘法 + 取模，任何环境结果一致。
 * ========================================================================== */

/**
 * 创建一个 LCG 随机数发生器
 * @param {number} seed 任意整数种子
 * @returns {() => number} 每次调用返回 [0, 1) 的伪随机数
 */
export function makeLcg(seed = 1) {
  // >>> 0 强制转成无符号 32 位，避免负数参与乘法后符号出错
  let state = (Math.imul(seed | 0, 1103515245) + 12345) >>> 0
  return function next() {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    // 除以 2^32 得到 [0, 1)
    return state / 4294967296
  }
}

/** 从数组里随机取一个（用 Math.random —— 用于「每次不一样」的场景，比如安慰语） */
export function pickOne(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  return list[Math.floor(Math.random() * list.length)]
}

/** 限制在 [min, max] */
export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value
}
