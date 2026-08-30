import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 用相对资源路径（base: './'），这样构建产物可放在任意子路径（如 /dnd/）下，
// 部署到 GitHub Pages 的任意域名都能正确加载。开发服务器仍用 '/'。
//
// 构建直接输出到站点的 ../dnd/（即最终发布目录），省掉手工复制 dist 的步骤；
// outDir 在项目根之外，必须显式 emptyOutDir 才会清空。
export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [react()],
  build: {
    outDir: '../dnd',
    emptyOutDir: true,
  },
}))
