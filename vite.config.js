import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  // 部署在子域名根目录（https://love.ccflysim.cn/），所以 base 用 '/'
  base: '/',
  plugins: [vue()],

  server: {
    host: true, // 允许手机连同一局域网调试：http://<你的内网IP>:5174
    port: 5174,
    strictPort: true,
  },

  build: {
    // 微信内置浏览器基本是：iOS 12+ / X5(Chromium 66~86) / Android WebView
    // 语法降到 es2018，避免老机型白屏（可选链等由 esbuild 转译）
    target: 'es2018',
    cssTarget: 'chrome61',
    // 小图内联成 base64，减少一次请求
    assetsInlineLimit: 4096,
    // 单文件提醒阈值调高：这个项目就是一个小 SPA，不需要拆包
    chunkSizeWarningLimit: 800,
    // 移动端弱网：生产 sourcemap 只会变大，不留
    sourcemap: false,
  },

  /**
   * 单元测试（vitest）配置。
   * environment: 'node' —— 被测的都是纯函数（心形曲线、随机数、尺寸计算、config 校验），
   * 不需要 DOM，跑得最快。
   */
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    reporters: 'default',
  },
})
