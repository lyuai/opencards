# OpenCards · 掼蛋

在浏览器里打一局完整掼蛋。你坐南家，对家是队友；规则引擎判定能不能出，教练只看着公开牌面给建议。

Godot 客户端留在 `godot` 分支。`main` 是现在的网页产品。

## 本地开打

需要 Node.js 22+、pnpm 10+、Python 3.9+。

```sh
git submodule update --init
python3 -m venv services/api/.venv
services/api/.venv/bin/pip install -r services/api/requirements-dev.txt
pnpm install
```

一个终端跑网页，另一个跑对局服务：

```sh
pnpm dev
npm run api
```

打开 <http://localhost:3000>。服务在 <http://localhost:8080>，`GET /healthz` 可探活。

复制 `.env.example` 为 `.env.local`，填入服务端模型密钥后，右侧教练才能回答追问。密钥不要写成 `VITE_` 或任何会进浏览器的变量。

## 怎么打

- 点选或滑动选牌，合法组合才会点亮「出牌」。
- 跟牌必须压过当前牌型，否则点「不出」。
- 「提示」轮换当前能出的牌；右侧建议可以一键打出。
- 默认对手是规则 AI。强力 AI 会加载捆绑的 DanZero 价值网络，更慢也更准。
- 权威合法出牌来自 `rlcard-guandan`。语言模型只解释，不能改规则或发明置信度。

跑 `npm run test:api` 会执行 HTTP / 整局回归，以及钉住的上游引擎测试。

## 仓库结构

```text
apps/web/             React Router 牌桌与教练
services/api/         Python API 与 DanZero 策略
third_party/rlcard-guandan/ 掼蛋引擎与预训练权重
packages/contracts/   各端共用的 JSON Schema
knowledge/            规则与策略笔记
docs/                 架构与路线图
```

对局导入、本地 worker 和浏览器采集仍在仓库里，但不是公开产品入口。

## 发布

`render.yaml` 在 LYU.ai workspace 里起两个服务：静态站点 `opencards-web`（`https://dan.lyu.ai`），以及跑牌局的 `opencards-api`（`https://danapi.lyu.ai`）。网页构建时写入 `VITE_API_URL`；API 用 `WEB_ORIGIN` 放行站点来源。教练追问还需要在 Dashboard 填 `AI_API_KEY`。

见 [docs/architecture.md](docs/architecture.md)。
