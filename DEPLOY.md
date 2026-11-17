# 发布与局域网

前端和房间服务使用同一套规则。GitHub Pages 托管静态前端；线上房间由 `cloud/` 中的 Cloudflare Worker 与 D1 提供。局域网使用 `server/` 的 Node 服务，牌局保存在本机 `.data/`。

## GitHub Pages

前端构建时设置 `VITE_API_URL` 为已部署的房间服务来源，例如 `https://你的房间服务域名`，不带 `/api`。GitHub Pages 的基路径由项目 Vite 配置/发布工作流处理。页面可在桌面浏览器和手机浏览器访问。

GitHub Pages 本身不能运行 Node 服务。未设置云服务地址时，静态页面仍可以本机轮流抽牌；跨设备房间需要可访问的 API。

## 本机与局域网

安装根项目依赖后运行开发脚本，或先构建再运行生产服务。服务监听 `0.0.0.0`，其他设备在同一 Wi-Fi 下打开终端显示的局域网地址。电脑必须保持运行，并允许系统防火墙的本地入站连接。

## 云端房间服务

`cloud/` 是独立的部署源码，包含这些文件：

- `worker/index.ts`：Worker 入口与公开前端来源限制。
- `worker/store.ts`：D1 存储，更新时用版本号进行原子比较，防止同时抽牌重复消耗回合。
- `vendor/`：由共享游戏规则与服务生成的部署副本。
- `drizzle/`：正式数据库迁移及元数据，发布时由 Sites 应用。
- `.openai/hosting.json`：Sites 项目 ID 和 `DB` 绑定声明。

修改共享规则或 API 后，先在 `cloud/` 运行 `npm run sync-source`，再运行 `npm run build`、`npm run validate`、`npm test`。如果使用 pnpm，把 `npm run` 换成 `pnpm` 即可。依赖安装遵循仓库锁文件。

部署时把 `cloud/` 的源码复制到独立 checkout，排除 `node_modules`、`dist`、临时输出和任何凭证，避免在主 GitHub 仓库里建立嵌套 Git 仓库。Sites 返回的项目 ID 要写入 `.openai/hosting.json`。使用 Sites 的源码与打包流程提交对应源码和构建产物；不要手工构造部署 ID。

公开 GitHub 页面连接云 API 时，房间服务也必须允许未登录的访客访问。默认允许的前端来源为 `https://frankjie09.github.io`；需要增加自己的域名时，在云端设置 `ALLOWED_ORIGINS`（逗号分隔）。不要在前端放置 Sites 管理凭证或 API 管理密钥。

## 数据和限制

房间 24 小时后过期。客户端只收到公开牌桌状态，不会获得其他玩家的入场凭证或未抽取的牌堆。房间号用于找到牌桌，入场凭证用于恢复身份。云端数据库与本机房间各自独立。

当前通过 HTTP 轮询同步房间；抽牌操作由服务端校验回合和版本号。自定义规则在开局前保存，每局仍为 52 张牌。

## 验证

云端测试使用真实 SQLite 执行生成的 D1 迁移，再通过 Worker 的实际 HTTP 入口检查建房、入场、房主权限、凭证保护、并发抽牌、来源限制和过期清理。正式发布后还应从 GitHub 页面完成一次两端入场与抽牌检查。
