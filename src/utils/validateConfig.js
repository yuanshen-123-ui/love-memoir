/**
 * ============================================================================
 *  config.js 自检
 *  ---------------------------------------------------------------------------
 *  这个项目最可能被人改动的文件就是 config.js（换成自己的故事）。
 *  改错一个字段，表现往往是「第三关永远过不去」这种很难自己定位的问题。
 *
 *  所以这里做一次轻量校验：不抛错、不拦流程，只在控制台用中文说清楚哪里不对，
 *  同时对「能救」的情况做运行时兜底（见 QuizLevel 里对 ok 的兜底）。
 * ========================================================================== */

/**
 * @param {object} config
 * @returns {string[]} 问题列表（空数组 = 没问题）
 */
export function validateConfig(config) {
  const issues = []
  const K = (path, msg) => issues.push(`${path}：${msg}`)

  if (!config || typeof config !== 'object') {
    return ['config.js：没有导出 CONFIG 对象']
  }

  if (!config.title) K('title', '标题是空的')
  if (!config.subtitle) K('subtitle', '副标题是空的')

  /* ---- 开场 ---- */
  if (!config.upload || typeof config.upload !== 'object') {
    K('upload', '缺少 upload 配置')
  } else {
    for (const key of ['frameTip', 'pick', 'opening']) {
      if (!config.upload[key]) K(`upload.${key}`, '文案是空的')
    }
  }

  /* ---- 三关的标题区 ---- */
  for (const level of ['star', 'scratch', 'quiz']) {
    const l = config[level]
    if (!l || typeof l !== 'object') {
      K(level, `缺少 ${level} 配置`)
      continue
    }
    if (!l.title) K(`${level}.title`, '关卡标题是空的')
  }

  /* ---- 第三关的题目（最容易改错的地方） ---- */
  const questions = config.quiz && config.quiz.questions
  if (!Array.isArray(questions) || questions.length === 0) {
    K('quiz.questions', '至少要有一道题')
  } else {
    questions.forEach((q, i) => {
      const at = `quiz.questions[${i}]`
      if (!q || typeof q !== 'object') {
        K(at, '题目格式不对')
        return
      }
      if (!q.q) K(at + '.q', '题干是空的')
      if (!Array.isArray(q.options) || q.options.length < 2) {
        K(at + '.options', '至少要有 2 个选项')
        return
      }
      q.options.forEach((opt, j) => {
        if (!opt || typeof opt.text !== 'string' || !opt.text) {
          K(`${at}.options[${j}].text`, '选项文字是空的')
        }
      })
      const rightCount = q.options.filter((o) => o && o.ok === true).length
      if (rightCount === 0) {
        K(at, '没有任何一个选项标了 ok: true —— 这题会永远过不去')
      }
      if (rightCount > 1) {
        K(at, `有 ${rightCount} 个选项都标了 ok: true（每题只该有一个正确答案）`)
      }
    })
  }

  /* ---- 明信片 / 结局 ---- */
  const pc = config.postcard
  if (!pc || typeof pc !== 'object') {
    K('postcard', '缺少 postcard 配置')
  } else {
    if (!Array.isArray(pc.lines) || pc.lines.length === 0) {
      K('postcard.lines', '至少写一句')
    }
    if (!pc.accept) K('postcard.accept', '按钮文案是空的')
  }

  if (!config.ending || !config.ending.line) {
    K('ending.line', '结局那句话是空的')
  }

  return issues
}

/** 有问题就打印一次（不影响运行） */
export function warnConfigIssues(config) {
  const issues = validateConfig(config)
  if (issues.length) {
    console.warn(
      `[love-memoir] config.js 有 ${issues.length} 个问题，建议修一下：\n- ` + issues.join('\n- '),
    )
  }
  return issues
}
