import { describe, it, expect } from 'vitest'
import { makeLcg, pickOne, clamp } from '../src/utils/random.js'

describe('makeLcg', () => {
  it('固定种子 → 固定序列（装饰参数才能复现）', () => {
    const a = Array.from({ length: 8 }, makeLcg(42))
    const b = Array.from({ length: 8 }, makeLcg(42))
    expect(a).toEqual(b)
  })

  it('不同种子 → 不同序列', () => {
    const a = Array.from({ length: 8 }, makeLcg(1))
    const b = Array.from({ length: 8 }, makeLcg(2))
    expect(a).not.toEqual(b)
  })

  it('永远落在 [0, 1)', () => {
    const next = makeLcg(20241010)
    for (let i = 0; i < 5000; i++) {
      const v = next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('分布大致均匀（10 个桶都该有货）', () => {
    const next = makeLcg(7)
    const buckets = new Array(10).fill(0)
    for (let i = 0; i < 20000; i++) buckets[Math.floor(next() * 10)]++
    for (const n of buckets) {
      // 期望 2000，给足够宽的容差，只要求没有空桶/极端偏斜
      expect(n).toBeGreaterThan(1400)
      expect(n).toBeLessThan(2600)
    }
  })
})

describe('pickOne', () => {
  it('从数组里取到一个元素', () => {
    const list = ['不对哦', '再想想']
    for (let i = 0; i < 40; i++) expect(list).toContain(pickOne(list))
  })

  it('空数组/非数组时返回空串，不抛错', () => {
    expect(pickOne([])).toBe('')
    expect(pickOne(null)).toBe('')
    expect(pickOne(undefined)).toBe('')
  })
})

describe('clamp', () => {
  it('钳在区间内', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(5, 0, 10)).toBe(5)
  })
})
