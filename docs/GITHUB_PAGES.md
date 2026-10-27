# GitHub Pages 发布

`.github/workflows/pages.yml` 在 `main` 每次收到推送后，先运行回归检查，再构建并发布网站。也可在 Actions 的 **Deploy GitHub Pages → Run workflow** 手动触发。其他分支不会发布。

本仓库的预期地址为 <https://iamwzzr.github.io/AF5640-gorup/>；核对工具使用 `#/tool`，介绍默认打开。地址只有在仓库启用 Pages、部署成功后才可访问。

## 首次启用

仓库管理员需要在 [Settings → Pages](https://github.com/iamwzzr/AF5640-gorup/settings/pages) 的 **Build and deployment → Source** 选择 **GitHub Actions**。如需首次部署，保存后在 Actions 中重新运行该工作流即可；后续推送 `main` 自动更新。

2026-10-27 配置时，当前账号有代码推送权限，没有仓库 Pages 管理权限；创建 Pages 的 API 返回 404。因此代码可准备、测试和推送，但首次启用需要管理员完成以上设置。

## 静态网站如何运行核对

Pages 只托管静态文件，无法运行 FastAPI。Pages 构建将原有 `schemas.py`、`parser.py`、`engine.py` 和 `export.py` 打包到独立的浏览器 Worker，用 Pyodide 运行同一份 Python 校验、Decimal 计算和 ZIP 导出代码。

- 支持真实上传的 CSV、三组示例、输入校验、逐人核对、中英文切换与报告下载。
- 文件在浏览器中处理，不发送至核对 API；刷新后需要重新上传。
- Python、依赖、图片、模板和示例均从同一 Pages 地址加载，不依赖外部计算服务器或运行时 CDN。
- 首次点击“检查表格”才加载 Python；包括图片在内的发布文件约 17 MB。首次加载时间取决于网络和设备，加载失败可以重新点击，修改输入会终止旧任务。
- 本地 `./start.sh` 和普通 `npm run build` 继续使用 FastAPI。金额运算始终由 Python Decimal 完成，前端 JavaScript 只格式化金额字符串。

当前固定使用 Pyodide 314.0.7（Python 3.14.2），其发行包提供 Pydantic 2.12.5。服务器依赖锁定 Pydantic 2.14.1。两种环境均运行现有业务回归，并对照服务端生成的完整结果与输入指纹；升级任一环境时需重新运行这些检查。

## 构建与验证

使用 Node.js 26；服务器回归在 Python 3.13 下运行。依赖由 npm / pip 锁文件固定，Actions 按提交 SHA 固定。Pages 构建会下载 Python 依赖包，并根据固定 Pyodide 锁文件中的 SHA256 验证内容；浏览器不需要访问下载源。

```bash
npm --prefix frontend ci
npm --prefix frontend test
VITE_BASE_PATH=/AF5640-gorup/ npm --prefix frontend run build:pages
npm --prefix frontend run test:pages
```

`test:pages` 需要先运行 `build:pages`，两者按顺序执行。它在浏览器所用的 Python 环境中运行 34 项原有业务与证据回归，并检查三组示例的校验、计算和 ZIP；5 人及 100 人结果必须与服务端发布数据完全相同。

产物在 `frontend/dist-pages/`。构建时 `VITE_BASE_PATH` 指定部署路径；工作流自动设为仓库名。使用带仓库子路径的纯静态服务器检查时，图片、下载模板、示例和 Worker 都应从该路径加载。普通本地构建的产物仍在 `frontend/dist/`。

工作流分为 build 和 deploy 两个任务：build 运行服务器 40 项、前端 30 项以及浏览器 Python 回归，上传静态产物；deploy 仅从 `main` 发布，单独持有 `pages: write` 和 `id-token: write` 权限。测试失败不会覆盖当前网站。

参考：[Vite Pages 部署](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub 创建 Pages 的权限要求](https://docs.github.com/en/rest/pages/pages#create-a-github-pages-site)、[Pyodide 自托管](https://pyodide.org/en/stable/usage/downloading-and-deploying.html)。
