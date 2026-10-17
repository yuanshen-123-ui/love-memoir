import { ref, onBeforeUnmount } from 'vue'

/**
 * ============================================================================
 *  打字机效果
 *  ---------------------------------------------------------------------------
 *  几个细节：
 *    · 用 Array.from 拆字，而不是 str[i] —— 否则 emoji / 生僻字（代理对）
 *      会被拆成两个乱码半字。
 *    · 逗号句号后多停一会儿，读起来才像人在打，而不是匀速机器。
 *    · 尊重系统的「减少动态效果」：直接整句显示，不做逐字。
 *    · 组件卸载必须清掉定时器，否则快速切屏后定时器还在往已卸载的 ref 里写。
 * ========================================================================== */
export function useTypewriter(fullText, options = {}) {
  const { speed = 95, startDelay = 500 } = options

  const shown = ref('')
  const done = ref(false)

  const chars = Array.from(fullText || '')
  let timer = 0
  let index = 0
  let started = false

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function tick() {
    if (index >= chars.length) {
      done.value = true
      return
    }
    shown.value += chars[index++]
    // 标点后停顿更久（标点本身已经打出来了）
    const ch = chars[index - 1]
    const pause = /[，。！？、,.!?…]/.test(ch) ? speed * 4 : speed
    timer = setTimeout(tick, pause)
  }

  function start() {
    if (started) return
    started = true
    if (reduceMotion) {
      shown.value = chars.join('')
      done.value = true
      return
    }
    timer = setTimeout(tick, startDelay)
  }

  function stop() {
    if (timer) clearTimeout(timer)
    timer = 0
  }

  onBeforeUnmount(stop)

  return { shown, done, start, stop }
}
