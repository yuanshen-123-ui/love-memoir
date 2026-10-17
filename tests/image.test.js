import { describe, it, expect } from 'vitest'
import { fitSize } from '../src/utils/image.js'

describe('fitSize（图片压缩的目标尺寸）', () => {
  it('横图：长边缩到 800，比例不变', () => {
    expect(fitSize(1600, 1200, 800)).toEqual({ width: 800, height: 600 })
  })

  it('竖图（iPhone 拍的）：也是长边缩到 800', () => {
    expect(fitSize(1200, 1600, 800)).toEqual({ width: 600, height: 800 })
  })

  it('超长图（全景）：短边会很小，但长边仍是 800', () => {
    const r = fitSize(8000, 1000, 800)
    expect(r.width).toBe(800)
    expect(r.height).toBe(100)
  })

  it('小图绝不放大（放大只会变糊、还更占体积）', () => {
    expect(fitSize(320, 240, 800)).toEqual({ width: 320, height: 240 })
  })

  it('正方形', () => {
    expect(fitSize(3000, 3000, 800)).toEqual({ width: 800, height: 800 })
  })

  it('极端/异常输入不会产出 0 或负数（canvas 会直接报错）', () => {
    for (const [w, h] of [
      [1, 1],
      [0, 0],
      [4000, 1],
      [1, 4000],
    ]) {
      const r = fitSize(w, h, 800)
      expect(r.width).toBeGreaterThanOrEqual(1)
      expect(r.height).toBeGreaterThanOrEqual(1)
      expect(Number.isInteger(r.width)).toBe(true)
      expect(Number.isInteger(r.height)).toBe(true)
    }
  })
})
