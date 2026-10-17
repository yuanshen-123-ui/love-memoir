import { reactive } from 'vue'

/**
 * 极简 toast：全站唯一的「提示」出口。
 * 存在意义就是不使用原生 alert() —— alert 在微信里会阻塞渲染、样式丑、
 * 而且会打断正在跑的 CSS 动画。
 *
 * 用法：  import { toast } from '@/composables/useToast'
 *         toast('答错啦，再想想～')
 */
const state = reactive({ items: [] })

let seq = 0

export function toast(message, duration = 2000) {
  if (!message) return
  const id = ++seq
  state.items.push({ id, message })
  setTimeout(() => {
    const i = state.items.findIndex((t) => t.id === id)
    if (i > -1) state.items.splice(i, 1)
  }, duration)
}

export const toastState = state
