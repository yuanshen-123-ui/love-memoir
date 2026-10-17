import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * 底色一致性守卫
 * ---------------------------------------------------------------------------
 * 这个测试是为了防止一个**已经发生过**的 bug 复现：
 *
 *   index.html 内联了一个渐变（首屏用），style.css 的 body 又写了一个纯色，
 *   而 <link> 排在 <style> 后面 → 内联渐变被覆盖，
 *   于是「打开页面是纯色 #f6e3dc，JS 挂载后变成四段渐变」——底色肉眼可见地变了一下。
 *
 * 现在规则很简单：底色只有一个来源 = index.html 里的 --bg-grad / --bg-fill。
 * 谁再往别处写一个渐变色值，这个测试就会红。
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8')

const indexHtml = read('index.html')
const styleCss = read('src/style.css')
const appVue = read('src/App.vue')
const bgDecor = read('src/components/BgDecor.vue')
const rotateTip = read('src/components/RotateTip.vue')
const manifest = JSON.parse(read('public/manifest.webmanifest'))

describe('页面底色：单一来源', () => {
  it('index.html 里定义了 --bg-grad 和 --bg-fill', () => {
    expect(indexHtml).toMatch(/--bg-grad:\s*linear-gradient\(/)
    expect(indexHtml).toMatch(/--bg-fill:\s*#[0-9a-fA-F]{6}/)
  })

  it('html 用背景图铺 --bg-grad（首屏第一帧就有底色）', () => {
    expect(indexHtml).toMatch(/html\s*\{[^}]*background-image:\s*var\(--bg-grad\)/s)
  })

  it('body 是透明的（否则会盖住 html 上的渐变）', () => {
    // index.html 内联
    expect(indexHtml).toMatch(/body\s*\{[^}]*background:\s*transparent/s)
    // src/style.css
    expect(styleCss).toMatch(/body\s*\{[^}]*background:\s*transparent/s)
  })

  it('style.css 不再重复定义 --bg-grad（唯一来源原则）', () => {
    expect(styleCss).not.toMatch(/--bg-grad\s*:/)
  })

  it('style.css 里没有把 body 刷成某个纯色（曾经的 #f6e3dc 就是元凶）', () => {
    const bodyBlock = styleCss.match(/body\s*\{([\s\S]*?)\}/)?.[1] || ''
    expect(bodyBlock).not.toMatch(/background:\s*#/)
  })

  it('.bg-base 与横屏提示都消费同一个变量，不写死色值', () => {
    // 背景层已经抽成 BgDecor.vue（首页 / 播放页 / 固定版共用）
    expect(bgDecor).toMatch(/\.bg-base\s*\{[^}]*background:\s*var\(--bg-grad/s)
    expect(rotateTip).toMatch(/background:\s*var\(--bg-grad/)
  })

  it('全仓库只有 index.html 一处出现这个渐变的色值', () => {
    // 抽渐变里最有辨识度的那个起始色 #f9ecd7
    const files = {
      'index.html': indexHtml,
      'src/style.css': styleCss,
      'src/App.vue': appVue,
      'src/components/BgDecor.vue': bgDecor,
      'src/components/RotateTip.vue': rotateTip,
    }
    const owners = Object.entries(files)
      .filter(([, text]) => text.includes('#f9ecd7'))
      .map(([name]) => name)
    expect(owners).toEqual(['index.html'])
  })
})

describe('页面底色：与浏览器 UI / PWA 元信息对齐', () => {
  const fill = indexHtml.match(/--bg-fill:\s*(#[0-9a-fA-F]{6})/)[1].toLowerCase()

  it('theme-color 与 --bg-fill 一致（状态栏不会出现另一种颜色）', () => {
    const themeColor = indexHtml.match(/name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)?.[1]
    expect(themeColor?.toLowerCase()).toBe(fill)
  })

  it('manifest 的 theme_color / background_color 与 --bg-fill 一致', () => {
    expect(manifest.theme_color.toLowerCase()).toBe(fill)
    expect(manifest.background_color.toLowerCase()).toBe(fill)
  })
})
