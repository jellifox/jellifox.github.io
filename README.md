# jellifox.github.io

极简静态个人主页 + 项目入口。

- `index.html` — 落地页，含进入各项目的按钮。
- `dnd/` — DND 5R 自动车卡工具的构建产物（Vite + React 单页应用，数据实时拉取自
  [DND5eChm/DND5e_chm](https://github.com/DND5eChm/DND5e_chm)，纯前端、无后端）。

## 部署

纯静态，发布仓库根目录即可：

- **Netlify**：导入本 GitHub 仓库，构建命令留空、发布目录 `.`（`netlify.toml` 已配置）。
- **GitHub Pages**：仓库 Settings → Pages → Source 选 `main` 分支根目录，
  即可在 `https://jellifox.github.io` 访问。

## 更新车卡工具

车卡工具源码在独立项目里。重新构建后把产物覆盖到 `dnd/`：

```sh
# 在车卡项目目录
npm run build
# 然后将 dist/ 覆盖到本仓库的 dnd/
```
