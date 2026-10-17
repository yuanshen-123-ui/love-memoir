import { describe, it, expect } from 'vitest'
import { heartPoints, heartPathD, HEART_STAR_COUNT } from '../src/utils/heart.js'

describe('heartPoints', () => {
  const points = heartPoints(HEART_STAR_COUNT, 0.06)

  it('数量正确', () => {
    expect(points).toHaveLength(HEART_STAR_COUNT)
  })

  it('全部落在 [0,1] 内（组件里要直接当百分比用）', () => {
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(1)
    }
  })

  it('四周留出 inset，星星不会贴边', () => {
    const xs = points.map((p) => p.x)
    const ys = points.map((p) => p.y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0.055)
    expect(Math.max(...xs)).toBeLessThanOrEqual(0.945)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0.055)
    expect(Math.max(...ys)).toBeLessThanOrEqual(0.945)
  })

  it('心尖在下、两个圆瓣在上（y 轴已按屏幕坐标翻转）', () => {
    // 最下方那两个点应该对称地挨着中点（心尖是折角，13 个采样点正好跨在它两边）
    const byY = [...points].sort((a, b) => a.y - b.y)
    const lowest = byY[byY.length - 1]
    expect(Math.abs(lowest.x - 0.5)).toBeLessThan(0.06)
    expect(lowest.y).toBeGreaterThan(0.82)

    // 最高处应该是左右两个圆瓣，且关于中线对称
    const [lobeA, lobeB] = byY
    expect(lobeA.y).toBeLessThan(0.2)
    expect(Math.abs(lobeA.y - lobeB.y)).toBeLessThan(1e-6)
    expect(Math.abs(lobeA.x + lobeB.x - 1)).toBeLessThan(0.02)

    // 两个圆瓣之间有个凹口（第 0 个采样点正好落在这里），它比圆瓣低
    expect(Math.abs(points[0].x - 0.5)).toBeLessThan(1e-6)
    expect(points[0].y).toBeGreaterThan(lobeA.y + 0.1)
  })

  it('按弧长等分 → 除心尖折角外，相邻点弦长基本一致', () => {
    const dists = []
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      dists.push(Math.hypot(a.x - b.x, a.y - b.y))
    }
    const sorted = [...dists].sort((a, b) => a - b)

    // 跨过「心尖」的那一条边：曲线在心尖处是折角，
    // 弦长必然明显短于弧长 —— 这条反而证明采样是对的（弧长等分，不是 t 等分）
    expect(sorted[0] / sorted[1]).toBeLessThan(0.65)

    // 其余 12 条边应该非常接近（如果按 t 均匀采样，这里会差到 2~3 倍）
    const rest = sorted.slice(1)
    expect(rest[rest.length - 1] / rest[0]).toBeLessThan(1.1)
  })

  it('是纯函数：同样参数两次调用结果一致', () => {
    expect(heartPoints(9, 0.1)).toEqual(heartPoints(9, 0.1))
  })
})

describe('heartPathD', () => {
  const d = heartPathD(96, 0.06)

  it('是一个闭合的 SVG 路径', () => {
    expect(d.startsWith('M')).toBe(true)
    expect(d.trim().endsWith('Z')).toBe(true)
  })

  it('采样密度足够（不只是一圈折线）', () => {
    const segments = d.split('L').length
    expect(segments).toBeGreaterThan(90)
  })

  it('坐标都在 viewBox 0~100 里', () => {
    const nums = d.match(/-?\d+(\.\d+)?/g).map(Number)
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(-0.01)
      expect(n).toBeLessThanOrEqual(100.01)
    }
  })
})
