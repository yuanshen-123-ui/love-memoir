import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

/**
 * ESLint 9 的扁平配置（flat config）。
 *
 * 只开「essential」而不是「recommended」：recommended 里一大半是缩进、换行之类的
 * 排版规则，和 prettier 抢活干、还会制造无意义的 diff。
 * essential 抓的是真正的错误（模板里用了未定义的东西、重复的 key、v-for 缺 key 等）。
 */
export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.audit-tmp/**', 'public/**', 'coverage/**'],
  },

  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 组件名就叫 StarLevel / App 这种，单文件组件不需要强制多词
      'vue/multi-word-component-names': 'off',
      // 本项目会在开发态打日志（config 自检、音频降级），允许保留
      'no-console': 'off',
    },
  },
]
