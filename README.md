# 低价罗盘

一个按预算、日期或目的地寻找低价往返机票的轻量网页。前端是纯 HTML/CSS/JS，部署到 GitHub Pages；Cloudflare Worker 聚合机票接口并保护密钥，D1 保存共享价格历史。

- 在线体验：https://gitanamomo.github.io/lowfare-compass/
- GitHub 仓库：https://github.com/gitanamomo/lowfare-compass

> 价格仅用于旅行规划。程序不出票、不收款，购买前必须到供应商页面确认最终价格、税费和行李规则。

## 功能

- 日期已定：按固定往返日期寻找预算内目的地。
- 时间自由：按时间窗口、停留天数和预算寻找低价组合。
- 目的地明确：整理最低价往返日期并显示日期价格板。
- 最多三个出发城市，支持直飞或最多一次中转。
- 明确区分供应商近期参考价、实时复价、演示数据和本站历史最低价。
- 没有配置接口时自动使用明显标记的演示数据，演示结果不能跳转购买。
- 常用出发城市、预算和 Worker 地址保存在浏览器 `localStorage`。

## 文件结构

```text
travel/
├── index.html              # 单文件前端：页面、样式和交互
├── worker.js               # Cloudflare Worker API、供应商适配与演示降级
├── schema.sql              # D1 价格历史和搜索缓存表
├── wrangler.jsonc          # Worker 与 D1 配置模板
├── package.json            # 测试、本地运行和部署命令
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

供应商密钥只允许通过 Worker Secrets 配置，禁止写进 `index.html`、`worker.js`、`wrangler.jsonc` 或 Git：

```bash
npx wrangler secret put TRAVELPAYOUTS_TOKEN
npx wrangler secret put AMADEUS_CLIENT_ID
npx wrangler secret put AMADEUS_CLIENT_SECRET
```

开发环境可在未提交的 `.dev.vars` 中设置：

```dotenv
TRAVELPAYOUTS_TOKEN=your_token
AMADEUS_CLIENT_ID=your_client_id
AMADEUS_CLIENT_SECRET=your_client_secret
AMADEUS_BASE_URL=https://test.api.amadeus.com
```

- Travelpayouts：提供近期缓存价格，结果标记为“近期参考价”。
- Amadeus：用于探索价格和选中行程后的实时 Flight Offers 复价；官方数据覆盖并不完整。
- Skyscanner：已保留供应商适配位置，获得合作 API 审核后再接入 Indicative 和 Live Prices，不能在客户端直接调用。

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

三种搜索接口都接收 `origins`、`budget` 和 `maxStops`。固定日期模式使用 `departDate`、`returnDate`；灵活模式使用 `earliest`、`latest`、`stayMin`、`stayMax`；目的地模式额外使用 `destination`。

## 测试

不安装第三方依赖也可以执行核心测试：

```bash
npm test
npm run validate
```

验收还需在 macOS Safari 和 iPhone 尺寸检查：三个搜索表单、出发城市标签、结果卡、日期价格板、演示状态、Worker 连接和复价跳转。

## 部署

### Worker 和 D1

1. 创建 D1 并替换 `wrangler.jsonc` 中的数据库 ID。
2. 将 `ALLOWED_ORIGINS` 改成 GitHub Pages 正式域名；多个地址用英文逗号分隔。
3. 初始化远程数据库：

   ```bash
   npx wrangler d1 execute lowfare-compass --remote --file=schema.sql
   ```

4. 设置供应商 Secrets，并运行 `npx wrangler deploy`。
5. 在网页“接口设置”中保存部署后的 `workers.dev` 地址。

### GitHub Pages

将仓库发布源设为主分支根目录。`index.html` 没有构建步骤，可直接由 GitHub Pages 托管。

## 修改指南

- 调整界面、表单或结果卡：编辑 `index.html`。
- 新增供应商：在 `worker.js` 增加适配函数，将返回值标准化为 `normalizeOffer()` 接收的字段，再加入 `searchAll()`。
- 修改价格历史口径：同时修改 `offerFingerprint()`、`schema.sql` 索引和 README 说明。
- 增加搜索参数：前端三个表单、`formPayload()`、Worker 的 `validateSearch()` 和自动测试必须同步修改。
- 任何供应商参考价都不得标为实时价；只有即时 Flight Offers 查询成功后才允许使用 `status: "live"`。

## 改动记录

### 0.1.0 · 2026-08-29

- 建立三模式响应式前端和旅行票据视觉系统。
- 建立 Worker API、Travelpayouts/Amadeus 适配、演示降级和复价流程。
- 建立 D1 历史价格 schema、统一结果模型、去重排序和安全检查。
- 补充本地运行、数据源配置、测试和部署说明。
- 创建 GitHub 仓库并启用 GitHub Pages。
