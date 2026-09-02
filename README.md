# Gina的低价护照

一个按预算、日期或目的地寻找低价往返机票并匹配特色住宿的轻量网页。前端是纯 HTML/CSS/JS，生产环境使用 Netlify CDN 与 Functions；供应商密钥只保存在服务端环境变量中。Cloudflare Worker + D1 保留为可选部署方案。

- 正式网站：https://gina-lowfare-passport.netlify.app/
- 静态演示：https://gitanamomo.github.io/lowfare-compass/
- GitHub 仓库：https://github.com/gitanamomo/lowfare-compass

> GitHub Pages 地址用于静态演示；Netlify 正式网站通过同域 Function 搜索实时数据。

> 价格仅用于旅行规划。程序不出票、不收款，购买前必须到供应商页面确认最终价格、税费和行李规则。

## 功能

- 日期已定：按固定往返日期寻找预算内目的地。
- 时间自由：按时间窗口、停留天数和预算寻找低价组合。
- 目的地明确：整理最低价往返日期并显示日期价格板。
- 住宿匹配：每个航班提供省钱首选、当地特色和综合最优三类住宿，并计算机票加住宿的人均总价。当前未接入实时住宿接口时展示明确标注的特色住宿类型示例；Airbnb 仅作为相同目的地和日期的补充搜索入口。
- 最多三个出发城市，支持直飞或最多一次中转。
- 明确区分供应商近期参考价、实时复价、演示数据和本站历史最低价。
- 没有配置接口时自动使用明显标记的演示数据，演示结果不能跳转购买。
- 常用出发城市、预算和 Worker 地址保存在浏览器 `localStorage`。

## 文件结构

```text
travel/
├── index.html              # 单文件前端：页面、样式和交互
├── worker.js               # 通用 API、供应商适配与演示降级
├── netlify.toml            # Netlify 构建、Functions 与安全响应头
├── netlify/functions/
│   └── api.mjs             # Netlify API 入口与按 IP 限流
├── schema.sql              # D1 价格历史和搜索缓存表
├── wrangler.jsonc          # Worker 与 D1 配置模板
├── package.json            # 测试、本地运行和部署命令
├── scripts/deploy-netlify.mjs # 一键 zip 部署到 Netlify（读取 NETLIFY_TOKEN 环境变量）
├── scripts/validate.mjs    # 静态结构及密钥泄露检查
└── test/worker.test.mjs    # 参数、排序、去重、演示模式测试
```

## 本地运行

前端不需要安装依赖：

```bash
python3 -m http.server 5500 --bind 127.0.0.1
```

打开 `http://127.0.0.1:5500`。未设置 Worker 地址时，页面显示演示结果。

运行 Worker 需要 Node.js 和 Wrangler：

```bash
npm install
npx wrangler d1 create lowfare-compass
```

将命令返回的 `database_id` 填入 `wrangler.jsonc`，然后初始化本地数据库并启动：

```bash
npx wrangler d1 execute lowfare-compass --local --file=schema.sql
npx wrangler dev
```

在网页右上角“接口设置”中填写 `http://127.0.0.1:8787`。

## 数据源配置

供应商密钥禁止写进 `index.html`、`worker.js`、配置文件或 Git。Netlify 正式环境在项目的 **Environment variables** 中配置：

```dotenv
TRAVELPAYOUTS_TOKEN=your_token
ALLOW_DEMO=true
```

可选增加 `BOOKING_API_KEY`、`BOOKING_AFFILIATE_ID` 和 `BOOKING_BASE_URL`。环境变量更新后需要重新部署。

> ⚠️ Amadeus 自服务开发者门户已于 2026-07-17 关停（官方公告），Self-Service key 全部失效且新注册暂停。`AMADEUS_*` 环境变量与相关适配仅作为历史保留，当前生效的数据源为 Travelpayouts（近期参考价）。

Cloudflare 备用部署使用 Worker Secrets：

```bash
npx wrangler secret put TRAVELPAYOUTS_TOKEN
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
npx wrangler secret put BOOKING_API_KEY
npx wrangler secret put BOOKING_AFFILIATE_ID
```

开发环境可在未提交的 `.dev.vars` 中设置：

```dotenv
TRAVELPAYOUTS_TOKEN=your_token
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
AMADEUS_BASE_URL=https://test.api.amadeus.com
BOOKING_API_KEY=your_booking_api_token
BOOKING_AFFILIATE_ID=your_affiliate_id
BOOKING_BASE_URL=https://demandapi-sandbox.booking.com/3.2
```

- Travelpayouts：提供近期缓存价格，结果标记为“近期参考价”；当前唯一生效的真实数据源。
- Amadeus：官方自服务 API（含 Flight Offers、Amadeus Hotels）已于 2026-07-17 关停，key 失效、新注册暂停；相关适配函数保留，等待接入替代方案（如 Duffel）。
- Skyscanner：已保留供应商适配位置，获得合作 API 审核后再接入 Indicative 和 Live Prices，不能在客户端直接调用。
- Booking.com Demand API 3.2：搜索所选日期的真实可订住宿，补充详情图片并跳转供应商页面；需要合作伙伴 API token 和 Affiliate ID（未申请）。
- Airbnb：只生成普通的同日期搜索入口，不调用未公开 API、不抓取网页，也不在本站声称其价格可订。
- Netlify Function：线上默认使用同域 `/api/*`，每个 IP 每分钟最多 30 个请求；免费计划达到硬上限后停止服务，不会自动产生超额费用。
- Cloudflare Worker：只接受配置的 GitHub Pages/本地来源，每个 IP 每天最多 120 次写查询；供应商密钥仅保存在 Worker Secrets。

## API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 数据源配置状态 |
| GET | `/api/places?q=` | 城市和机场联想 |
| POST | `/api/search/fixed-dates` | 固定日期探索目的地 |
| POST | `/api/search/flexible` | 灵活日期和目的地搜索 |
| POST | `/api/search/destination` | 固定目的地最低日期 |
| POST | `/api/refresh` | 对选中行程实时复价 |
| GET | `/api/price-history` | 查询同航线、日期、舱位和人数的历史最低价 |
| POST | `/api/stays/search` | 匹配真实住宿或返回明确标注的特色住宿类型示例 |

三种搜索接口都接收 `origins`、`budget` 和 `maxStops`。固定日期模式使用 `departDate`、`returnDate`；灵活模式使用 `earliest`、`latest`、`stayMin`、`stayMax`；目的地模式额外使用 `destination`。

## 测试

不安装第三方依赖也可以执行核心测试：

```bash
npm test
npm run validate
```

验收还需在 macOS Safari 和 iPhone 尺寸检查：三个搜索表单、出发城市标签、结果卡、日期价格板、演示状态、Worker 连接和复价跳转。

## 部署

### Netlify（正式方案）

> 实际部署方式为**本地 zip 部署**（站点未连接 GitHub 持续部署，push 到 main 不会自动上线）。

1. 在 Netlify 后台 **Site configuration → Environment variables** 配置密钥（免费计划无法通过 API 写入环境变量）。
2. 一键部署（读取 `NETLIFY_TOKEN` 环境变量，可在 Netlify 后台 User settings → Applications 生成）：

   ```bash
   NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs
   ```

3. 验收：`curl https://gina-lowfare-passport.netlify.app/api/health` 应显示 `travelpayouts.configured: true`；再检查真实搜索、住宿匹配和购买跳转。

### Cloudflare Worker 和 D1（备用）

1. 创建 D1 并替换 `wrangler.jsonc` 中的数据库 ID。
2. 将 `ALLOWED_ORIGINS` 改成 GitHub Pages 正式域名；多个地址用英文逗号分隔。
3. 初始化远程数据库：

   ```bash
   npx wrangler d1 execute lowfare-compass --remote --file=schema.sql
   ```

4. 设置供应商 Secrets，并运行 `npx wrangler deploy`。
5. 在网页“接口设置”中保存部署后的 `workers.dev` 地址。

### GitHub Pages

将仓库发布源设为主分支根目录。GitHub Pages 仅展示静态演示；正式在线搜索使用 Netlify。

## 修改指南

- 调整界面、表单或结果卡：编辑 `index.html`。
- 新增供应商：在 `worker.js` 增加适配函数，将返回值标准化为 `normalizeOffer()` 接收的字段，再加入 `searchAll()`。
- 修改价格历史口径：同时修改 `offerFingerprint()`、`schema.sql` 索引和 README 说明。
- 增加搜索参数：前端三个表单、`formPayload()`、Worker 的 `validateSearch()` 和自动测试必须同步修改。
- 任何供应商参考价都不得标为实时价；只有即时 Flight Offers 查询成功后才允许使用 `status: "live"`。
- Airbnb 只能作为补充跳转入口；没有 Airbnb 正式合作授权时不得抓取房源、图片、价格或可订状态。

## 改动记录

### 0.1.0 · 2026-08-29

- 建立三模式响应式前端和旅行票据视觉系统。
- 建立 Worker API、Travelpayouts/Amadeus 适配、演示降级和复价流程。
- 建立 D1 历史价格 schema、统一结果模型、去重排序和安全检查。
- 补充本地运行、数据源配置、测试和部署说明。
- 创建 GitHub 仓库并启用 GitHub Pages。

### 0.2.0 · 2026-08-30

- 将界面重构为彩色护照拼贴风格。
- 增加 Booking.com 真实住宿适配、三类特色住宿推荐和旅行总价估算。
- 增加 Airbnb 同目的地、同日期的补充搜索入口。
- 品牌名称更新为“Gina的低价护照”。
- 增加 Amadeus 实时酒店价格适配、购买平台跳转、来源白名单和每日查询限额。
- 增加 Netlify Function、同域 API、每 IP 限流、安全响应头和 GitHub 持续部署配置。
- 发布到 `gina-lowfare-passport.netlify.app`，保留 GitHub Pages 作为静态演示。

### 0.2.1 · 2026-09-02

- 修正文档漂移：实际部署方式为本地 zip 部署（站点未连 GitHub 持续部署），部署章节已重写。
- 记录 Amadeus 自服务关停（2026-07-17）的影响：Travelpayouts 成为唯一生效的真实数据源；降级提示文案与数据源状态说明已同步更新。
- 新增 `scripts/deploy-netlify.mjs` 一键部署脚本；部署细节与待办见 `TODO.md`。
