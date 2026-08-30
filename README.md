# jellifox.github.io

极简静态个人主页 + 项目入口。

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.html` | 落地页（Frutiger Aero 风格），含进入各项目的按钮 |
| `dnd-builder/` | **DND 5R 自动车卡工具的源码**（Vite + React + TypeScript） |
| `dnd/` | 车卡工具的**构建产物**，由 `dnd-builder` 构建生成，直接对外发布 |
| `dnd/sheet.html` | 内嵌的面团角色卡（源文件在 `dnd-builder/public/sheet.html`） |

源码与产物都在本仓库里：`dnd-builder/` 负责开发，`dnd/` 负责发布。

## 本地开发

```sh
cd dnd-builder
npm install
npm run dev
```

打开终端显示的地址（默认 <http://localhost:5180>）。车卡数据由浏览器实时拉取自
[DND5eChm/DND5e_chm](https://github.com/DND5eChm/DND5e_chm)，纯前端、无后端，需要联网。

预览整站（含落地页与已构建的车卡工具）：

```sh
python3 -m http.server 8899
```

## 构建与发布

```sh
cd dnd-builder
npm run build
```

构建产物**直接输出到 `../dnd/`**（`vite.config.ts` 里配置了 `outDir`），无需手工复制。
构建完成后提交 `dnd/` 的改动并推送即可，GitHub Pages 会自动部署。

## 部署

纯静态，发布仓库根目录：

- **GitHub Pages**：仓库 Settings → Pages → Source 选 `main` 分支 `/ (root)`，
  访问 <https://jellifox.github.io>。

## 更新面团角色卡

`dnd/sheet.html` 是第三方的「橘猫妙妙DND面团车卡工具」，源文件放在
`dnd-builder/public/sheet.html`。拿到新版本时：

1. 用新版原始 HTML 覆盖 `dnd-builder/public/sheet.html`
2. 把车卡工具的交接脚本重新追加到 `</body>` 前
   （原文件中该段有 `车卡工具交接（本站添加，非面团原始代码）` 注释标识，照抄即可）
3. `npm run build`

交接脚本的作用：车卡工具点「在面团角色卡中打开」时，会把角色数据写入
`localStorage['dnd5r-builder:handoff']`，该脚本在面团初始化后读取、套用并清除它。
必须是经典 `<script>`（与面团脚本共享 script scope 才能访问 `let state` / `const State`），
且注册在 `State.init()` 之后。
