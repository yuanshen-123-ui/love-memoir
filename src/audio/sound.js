/**
 * ============================================================================
 *  零素材音频引擎
 *  ---------------------------------------------------------------------------
 *  这个小站没有任何 mp3/ogg 资源 —— 所有声音都是 WebAudio 现场合成的。
 *
 *  为什么这么做：
 *    1. 不用找无版权音乐、不用把音频文件塞进仓库，整站依然只有 100KB 左右
 *    2. 八音盒音色非常适合「心跳 + 回忆」的氛围，而它本质上就是
 *       「正弦波 + 快起音 + 慢衰减 + 一点点延迟混响」
 *
 *  移动端三个必须处理的现实：
 *    · iOS/微信 禁止自动播放：AudioContext 必须在用户手势里创建/恢复
 *      → App 挂载时在第一次 pointerdown 上 unlock()
 *    · 页面切到后台要暂停，否则费电、且回来时 `currentTime` 跳变会让音符堆在一起
 *    · 某些 WebView 干脆没有 AudioContext（或创建就抛错）
 *      → 所有函数都必须能在「没有声音」的情况下安静地什么都不做
 * ========================================================================== */

import { loadSoundPref, saveSoundPref } from '../utils/storage.js'

/** C 大调五声音阶（去掉半音，随便走都不会难听），跨两个八度 */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51]

/** 两种「情绪」用不同速度/音量/停留度，结局更慢更空 */
const MOODS = {
  game: { gap: 0.46, gain: 0.075, dur: 2.0, rest: 0.16 },
  ending: { gap: 0.66, gain: 0.065, dur: 2.8, rest: 0.3 },
}

let ctx = null
let bus = null // 所有声音汇入的低通节点（顺便模拟「隔着房间听」的闷）
let master = null
let delayWet = null
let enabled = loadSoundPref()

let musicTimer = 0
let nextNoteAt = 0
let mood = 'game'
let noteIndex = 3
let dir = 1
let musicWanted = false
/** 是否收到过用户手势（决定能不能创建 AudioContext） */
let gestureSeen = false

/** 订阅音量/开关变化（给 UI 用） */
const listeners = new Set()
function notify() {
  listeners.forEach((fn) => {
    try {
      fn(enabled)
    } catch {
      /* 忽略订阅者自己的错 */
    }
  })
}

export function onSoundChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isSoundEnabled() {
  return enabled
}

function audioSupported() {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
}

/**
 * 懒创建 AudioContext（必须在用户手势里调用，否则 iOS 会是 suspended）
 */
export function ensureContext() {
  if (ctx || !audioSupported()) return ctx
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    ctx = new AC()

    master = ctx.createGain()
    master.gain.value = enabled ? 1 : 0

    // 低通：把振荡器的「电子味」磨掉，更像八音盒
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 5200
    lp.Q.value = 0.4

    // 简易延迟混响：一个 delay + 反馈 + 湿声，房间感就够了
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.28
    const feedback = ctx.createGain()
    feedback.gain.value = 0.26
    delayWet = ctx.createGain()
    delayWet.gain.value = 0.24

    bus = lp
    lp.connect(master)
    lp.connect(delay)
    delay.connect(feedback)
    feedback.connect(delay)
    delay.connect(delayWet)
    delayWet.connect(master)
    master.connect(ctx.destination)
  } catch (err) {
    console.warn('[love-memoir] 音频不可用，已静音降级', err)
    ctx = null
  }
  return ctx
}

/**
 * 用户第一次触摸时调用：把 AudioContext 从 suspended 解开。
 * 在收到手势之前绝不创建 AudioContext —— 否则 Chrome 会在控制台警告
 * 「AudioContext was not allowed to start」，也白白占一个音频线程。
 */
export function unlock() {
  gestureSeen = true
  const c = ensureContext()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  // 之前「想听音乐」但还没解锁 → 现在补上
  if (musicWanted) resumeScheduler()
}

/**
 * 弹一个音
 * @param {number} freq 频率
 * @param {object} opt when(相对秒) / dur / gain / type
 */
function tone(freq, opt = {}) {
  if (!ctx || !bus) return
  const { when = 0, dur = 1.6, gain = 0.1, type = 'sine' } = opt
  try {
    const t0 = ctx.currentTime + Math.max(0, when)
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    // 快起音 + 指数衰减 = 敲击感
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(env)
    env.connect(bus)
    osc.start(t0)
    osc.stop(t0 + dur + 0.06)
  } catch {
    /* 忽略：极端环境下停止振荡器可能报错 */
  }
}

/* ========================================================================== */
/*  短音效                                                                    */
/* ========================================================================== */
export const sfx = {
  /** 普通点击 */
  tap() {
    tone(880, { dur: 0.1, gain: 0.045 })
  },
  /** 点亮星星：参数是第几颗，音高顺着五声音阶往上走 —— 连点像在弹琴 */
  star(step = 0) {
    const i = Math.max(0, Math.min(PENTATONIC.length - 1, step))
    tone(PENTATONIC[i], { dur: 0.9, gain: 0.075 })
    tone(PENTATONIC[i] * 2, { dur: 0.5, gain: 0.022 })
  },
  /** 答对：三音上行 */
  success() {
    ;[0, 2, 5].forEach((d, i) => tone(PENTATONIC[d], { when: i * 0.085, dur: 1.3, gain: 0.07 }))
  },
  /** 答错：两个下行短音，不刺耳 */
  wrong() {
    tone(330, { dur: 0.16, gain: 0.05, type: 'triangle' })
    tone(247, { when: 0.09, dur: 0.24, gain: 0.045, type: 'triangle' })
  },
  /** 刮开揭晓：一串上行 */
  reveal() {
    ;[0, 2, 3, 5, 7].forEach((d, i) => tone(PENTATONIC[d], { when: i * 0.07, dur: 1.5, gain: 0.055 }))
  },
  /** 轻巧的「啵」：彩蛋、次要反馈 */
  pop() {
    tone(1174.66, { dur: 0.22, gain: 0.06 })
    tone(1567.98, { when: 0.05, dur: 0.3, gain: 0.04 })
  },
  /** 贴贴 */
  heart() {
    tone(PENTATONIC[4], { dur: 0.5, gain: 0.06 })
    tone(PENTATONIC[6], { when: 0.07, dur: 0.7, gain: 0.045 })
  },
}

/* ========================================================================== */
/*  背景音乐（八音盒）                                                         */
/* ========================================================================== */

/** 排一个音（用绝对时间，避免每帧累积误差） */
function scheduleNote(at) {
  const m = MOODS[mood]
  if (Math.random() > m.rest) {
    const freq = PENTATONIC[Math.max(0, Math.min(PENTATONIC.length - 1, noteIndex))]
    const rel = at - ctx.currentTime
    tone(freq, { when: rel, dur: m.dur, gain: m.gain })
    // 高八度泛音：八音盒的金属齿音，音量要很小
    tone(freq * 2, { when: rel, dur: m.dur * 0.55, gain: m.gain * 0.3 })
  }

  // 随机游走：72% 保持方向，偶尔跳两度，撞到边界就掉头
  if (Math.random() > 0.72) dir = -dir
  noteIndex += dir * (Math.random() < 0.8 ? 1 : 2)
  if (noteIndex < 0) {
    noteIndex = 1
    dir = 1
  }
  if (noteIndex > PENTATONIC.length - 1) {
    noteIndex = PENTATONIC.length - 2
    dir = -1
  }
}

/**
 * 用 250ms 的定时器 + 0.8s 前瞻去排音符。
 * 这是 WebAudio 的标准做法：JS 定时器只负责「往前看一小段」，
 * 真正的发声时间交给音频线程，所以不会因为主线程卡一下就节奏乱掉。
 */
function tick() {
  if (!ctx || ctx.state !== 'running') {
    // 还没解锁（比如用户还没点过屏幕）：不要排队，否则解锁瞬间会炸出一堆音
    nextNoteAt = (ctx ? ctx.currentTime : 0) + 0.3
    return
  }
  const horizon = ctx.currentTime + 0.8
  let guard = 0
  while (nextNoteAt < horizon && guard++ < 8) {
    scheduleNote(nextNoteAt)
    nextNoteAt += MOODS[mood].gap
  }
}

export function startMusic(nextMood = 'game') {
  mood = nextMood
  musicWanted = true
  resumeScheduler()
}

/** 内部：只停排程，不改「用户想听音乐」的意图（切后台、临时静音都会用到） */
function pauseScheduler() {
  if (musicTimer) {
    window.clearInterval(musicTimer)
    musicTimer = 0
  }
}

/** 内部：真正开始排程 */
function resumeScheduler() {
  // 还没被触摸过：不建上下文，等 unlock() 再来
  if (!gestureSeen) return
  const c = ensureContext()
  if (!c || !enabled || !musicWanted) return
  if (musicTimer) return
  nextNoteAt = c.currentTime + 0.4
  musicTimer = window.setInterval(tick, 250)
}

/** 用户明确要求停止音乐（离开关卡时调用） */
export function stopMusic() {
  musicWanted = false
  pauseScheduler()
}

export function setMood(nextMood) {
  if (mood === nextMood) return
  mood = nextMood
  if (ctx) nextNoteAt = ctx.currentTime + 0.2
}

/* ========================================================================== */
/*  开关                                                                      */
/* ========================================================================== */

export function setSoundEnabled(next) {
  enabled = !!next
  saveSoundPref(enabled)
  try {
    if (master && ctx) {
      // 淡入淡出，避免「咔」的一声
      const now = ctx.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(enabled ? 1 : 0, now + 0.25)
    }
  } catch {
    /* 忽略 */
  }
  if (!enabled) {
    pauseScheduler()
  } else if (musicWanted) {
    resumeScheduler()
  }
  notify()
  return enabled
}

export function toggleSound() {
  return setSoundEnabled(!enabled)
}

/* 切到后台就停，回来再续：省电，也避免回来时音符时间戳已经过期。
   注意这里只暂停排程，不动 musicWanted —— 否则切一次后台音乐就永远不回来了。 */
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseScheduler()
      if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {})
    } else if (musicWanted && enabled) {
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
      resumeScheduler()
    }
  })
}
