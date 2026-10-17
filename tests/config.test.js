import { describe, it, expect } from 'vitest'
import { validateConfig } from '../src/utils/validateConfig.js'
import { CONFIG } from '../src/config.js'

describe('validateConfig（真实 config.js）', () => {
  it('仓库里的 config.js 本身必须是通过校验的（CI 会因此挡住改错的配置）', () => {
    expect(validateConfig(CONFIG)).toEqual([])
  })

  it('每道题都恰好有一个 ok: true', () => {
    for (const q of CONFIG.quiz.questions) {
      const right = q.options.filter((o) => o.ok === true)
      expect(right).toHaveLength(1)
    }
  })

  it('选项数量至少能满足布局（>=2）', () => {
    for (const q of CONFIG.quiz.questions) {
      expect(q.options.length).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('validateConfig（故意改错的情况）', () => {
  const clone = () => JSON.parse(JSON.stringify(CONFIG))

  it('没导出配置', () => {
    expect(validateConfig(null).length).toBeGreaterThan(0)
  })

  it('某道题忘了标 ok: true → 会报出来', () => {
    const bad = clone()
    bad.quiz.questions[0].options.forEach((o) => {
      o.ok = false
    })
    const issues = validateConfig(bad)
    expect(issues.some((i) => i.includes('ok: true'))).toBe(true)
  })

  it('一道题标了两个正确答案 → 会报出来', () => {
    const bad = clone()
    bad.quiz.questions[0].options[0].ok = true
    const issues = validateConfig(bad)
    expect(issues.some((i) => i.includes('只该有一个'))).toBe(true)
  })

  it('题目数量为 0 → 会报出来', () => {
    const bad = clone()
    bad.quiz.questions = []
    expect(validateConfig(bad).some((i) => i.includes('至少要有一道题'))).toBe(true)
  })

  it('选项少于 2 个 → 会报出来', () => {
    const bad = clone()
    bad.quiz.questions[0].options = [{ text: '只有一个选项', ok: true }]
    expect(validateConfig(bad).some((i) => i.includes('至少要有 2 个选项'))).toBe(true)
  })

  it('明信片正文写成空数组 → 会报出来', () => {
    const bad = clone()
    bad.postcard.lines = []
    expect(validateConfig(bad).some((i) => i.includes('postcard.lines'))).toBe(true)
  })

  it('结局那句话忘了写 → 会报出来', () => {
    const bad = clone()
    bad.ending.line = ''
    expect(validateConfig(bad).some((i) => i.includes('ending.line'))).toBe(true)
  })
})
