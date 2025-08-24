# safe-min-dapp
# Safe 最简转账工具（GitHub Pages · 路径 B · 自托管 ethers）

## 部署
1. 将 `docs/` 目录推到 `main` 分支。
2. GitHub 仓库 → **Settings → Pages**：
   - Source: *Deploy from a branch*
   - Branch: `main`，Folder: `/docs` → **Save**
3. 访问：`https://<用户名>.github.io/<仓库名>/`（自动 HTTPS），勾选 **Enforce HTTPS**。

## 自托管 ethers
将 `node_modules/ethers/dist/ethers.umd.min.js` 复制到 `docs/vendor/` 并命名为 `ethers-5.7.2.umd.min.js`。

## 修改入口页面
仅需改 `docs/index.html`（布局/文案/样式）。交互逻辑在 `docs/js/` 下的模块中。
