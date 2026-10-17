/**
 * ============================================================================
 *  心形曲线：第一关的星星就落在这条曲线上
 *  ---------------------------------------------------------------------------
 *  经典心形参数方程（数学界最常见的那个"心形线"变体）：
 *
 *      x(t) = 16 · sin³t
 *      y(t) = 13·cos t − 5·cos 2t − 2·cos 3t − cos 4t        t ∈ [0, 2π)
 *
 *  它画出来是一颗标准的心：底部一个尖，上面两个圆弧。
 *
 *  两个关键处理：
 *    1. 【等弧长采样】直接按 t 均匀取点会让某些地方挤在一起（心尖附近尤其明显），
 *       所以先在曲线上密集采样 480 个点算出累计弧长，再按等弧长挑 13 个位置。
 *    2. 【归一化】原始 x ∈ [−16, 16]、y ∈ [−17, 12] 左右，这里统一映射到 [0,1]²，
 *       并且翻转 y 轴（屏幕坐标 y 向下为正），这样组件里直接用百分比定位。
 * ========================================================================== */

/** 默认星星数量：13 颗，正好绕心一圈（间距足够放 44px 热区） */
export const HEART_STAR_COUNT = 13

/** 曲线本身（原始坐标，y 向上为正） */
function rawPoint(t) {
  return [
    16 * Math.sin(t) ** 3,
    13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
  ]
}

/**
 * 在 [0, 2π) 上按「弧长等分」采样 count 个点，返回原始坐标
 */
function sampleByArcLength(count) {
  const DENSE = 480
  const pts = []
  for (let i = 0; i <= DENSE; i++) {
    pts.push(rawPoint((i / DENSE) * Math.PI * 2))
  }

  // 累计弧长
  const cum = [0]
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0]
    const dy = pts[i][1] - pts[i - 1][1]
    cum.push(cum[i - 1] + Math.hypot(dx, dy))
  }
  const total = cum[cum.length - 1]

  const out = []
  for (let k = 0; k < count; k++) {
    const target = (k / count) * total
    // 找到 target 落在哪一小段上
    let i = 1
    while (i < cum.length - 1 && cum[i] < target) i++
    const seg = cum[i] - cum[i - 1] || 1
    const f = (target - cum[i - 1]) / seg
    out.push([
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
    ])
  }
  return out
}

/** 把一组原始坐标归一化到 [0,1]²（保持长宽比居中，并翻转 y 轴） */
function normalize(points, inset) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  // 用较大的跨度统一缩放，形状才不会被拉扁
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const padX = (span - (maxX - minX)) / 2
  const padY = (span - (maxY - minY)) / 2
  const k = 1 - inset * 2

  return points.map(([x, y]) => ({
    x: inset + ((x - minX + padX) / span) * k,
    // y 轴翻转：数学上向上为正，屏幕上向下为正
    y: inset + (1 - (y - minY + padY) / span) * k,
  }))
}

/**
 * 星星坐标（归一化到 [0,1]²）
 * @param {number} count 星星数量
 * @param {number} inset 内缩比例（0.06 = 四周各留 6%）
 */
export function heartPoints(count = HEART_STAR_COUNT, inset = 0.06) {
  return normalize(sampleByArcLength(count), inset)
}

/**
 * 心形轮廓的 SVG path（viewBox 0 0 100 100），用于「点亮全部星星后描出一颗心」
 * @param {number} segments 采样密度，越大越顺滑
 * @param {number} inset 内缩比例
 */
export function heartPathD(segments = 96, inset = 0.08) {
  const pts = normalize(
    Array.from({ length: segments }, (_, i) => rawPoint((i / segments) * Math.PI * 2)),
    inset,
  )
  return (
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${(p.x * 100).toFixed(2)} ${(p.y * 100).toFixed(2)}`)
      .join(' ') + ' Z'
  )
}
