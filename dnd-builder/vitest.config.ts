import { defineConfig } from 'vitest/config'

// 解析器依赖浏览器的 DOMParser，用 jsdom 提供；夹具页面以 ?raw 方式导入。
// 不用 happy-dom：它把规则书里常见的未加引号属性 <FONT color=#800000> 错误解析为
// color="" 800000=""，红色标题全部识别不到；jsdom（parse5）与浏览器行为一致，且默认不加载外部资源。
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
