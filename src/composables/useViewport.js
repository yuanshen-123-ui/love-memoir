import { onMounted, onBeforeUnmount } from 'vue'

/**
 * ============================================================================
 *  真实视口高度 → CSS 变量 --app-h
 *  ---------------------------------------------------------------------------
 *  100vh 的坑：手机浏览器的地址栏会「吃掉」高度，而且滑动时还会伸缩。
 *    · 100vh  = 地址栏收起时的最大高度（底部按钮被顶到看不见的地方）
 *    · 100dvh = 动态高度，跟着地址栏实时变（但 iOS 16.4 之前不支持）
 *  所以两条腿走路：CSS 里用 dvh 兜底，这里用 JS 实测像素写进 --app-h，
 *  在 iOS 15 / 微信 X5 这类没有 dvh 的内核上就是唯一正确值。
 *
 *  为什么优先 visualViewport：
 *    微信里地址栏收起、键盘弹出时，window.innerHeight 更新往往滞后一拍，
 *    visualViewport.height 更及时、也更接近用户真正看到的高度。
 * ========================================================================== */
export function useViewportHeight() {
  let raf = 0

  const apply = () => {
    raf = 0
    const vv = window.visualViewport
    const h = Math.round((vv && vv.height) || window.innerHeight || 0)
    if (h > 0) {
      document.documentElement.style.setProperty('--app-h', `${h}px`)
    }
  }

  // 合并同一帧内的多次 resize，避免旋转屏幕时连续写样式
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  onMounted(() => {
    apply()
    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('orientationchange', schedule, { passive: true })
    // iOS 15 及更早 / 微信：地址栏伸缩只有 visualViewport 会及时通知
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', schedule, { passive: true })
      vv.addEventListener('scroll', schedule, { passive: true })
    }
  })

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    window.removeEventListener('resize', schedule)
    window.removeEventListener('orientationchange', schedule)
    const vv = window.visualViewport
    if (vv) {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
    }
  })
}
