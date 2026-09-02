# TODO — Gina的低价护照（lowfare-compass）

> 更新：2026-09-02。跨会话续作用的待办清单，做完一项勾一项。

## P0（阻塞上线）

- [x] **站点迁移到 gitanamo 团队并重新部署**（2026-09-02 完成）
  - 原因：旧站（Gitana 团队，gina-lowfare-passport）额度用超且不按自然月重置；用户提供了 gitanamo 团队（另一账号）的新 token
  - 新站：**https://lowfare-compass.netlify.app**（siteId `9dbe994e-a7d8-4703-a6a9-cecdbcfc3d4d`）
  - 教训：裸 zip API 不注册 Function（`/api/*` 全 404），部署脚本已改为 netlify-cli 本地打包（0.2.2）
- [ ] **在 Netlify UI 给新站配环境变量**：https://app.netlify.com/projects/lowfare-compass/configuration/env
  - Key：`TRAVELPAYOUTS_TOKEN`，Value：`7d59…c88`（免费计划 API 写不了 env，需手动）
  - 配好后跑 `NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs` 重部署并验收 `travelpayouts.configured: true`
- [x] **Amadeus 数据源决策**（2026-09-02 定案：**方案 A**，仅用 Travelpayouts）
  - 已落地：worker.js 降级文案与 providerStatus 说明已更新；Amadeus/Booking 适配保留备用
  - 复价行为：无 Amadeus 时 `/api/refresh` 返回 indicative + 提示去供应商页面确认（原有逻辑，无需改动）

## P1

- [ ] 若未来选方案 B（如 Duffel）：在 `worker.js` 新增供应商适配（参照现有适配结构，返回 `normalizeOffer()` 字段后加入 `searchAll()`），同步改测试
- [ ] 重新部署后整站验收：三种搜索模式、住宿匹配、复价跳转、Safari + iPhone 尺寸

## P2（文档与仓库卫生）

- [x] 修 README 部署章节漂移：已改为「本地 zip 部署」实际流程（0.2.1）
- [x] 数据源配置章节 Amadeus 描述已更新（自服务关停说明）
- [x] 新增 `scripts/deploy-netlify.mjs` 一键部署脚本 + `npm run deploy:netlify`
- [x] `.gitignore` 增加 `.workbuddy/`（会话记忆目录不入库）
- [ ] 检查 5 个站点谁在吃 Netlify 团队额度（用户更正：清醒回应真实地址为 sober-respond.netlify.app）

## P3（可选 / 收尾）

- [ ] 验收完成后提醒用户**撤销本次用的 Netlify token**（nfp_…9de6，gitanamo 团队）；旧 token nfp_…6011（Gitana 团队）也建议撤销
- [ ] Booking.com Demand API 合作申请（当前未申请）
- [ ] D1 价格历史功能在 Netlify 路径下无数据库支撑，属空转（Cloudflare 备用方案才有），考虑在 UI 隐藏或说明

## 背景（2026-08-30 实测结论）

- **Amadeus 自服务已死**：developers.amadeus.com 自服务门户于 2026-07-17 停用，Self-Service key 全部失效，新注册 2026 年春已暂停。此前免费政策（测试环境免费 + 生产每月免费额度，如 Flight Offers Search 2000 次/月）随关停一并终止。替代品：Duffel（自服务、无需 IATA）、Ignav 等。来源：developers.amadeus.com 官网公告、PhocusWire 2026-02 报道、apis.io 定价页、thunderbit/tripgic 迁移指南。
- **Travelpayouts 已验证可用**：token 实测 SZX→BKK 2026-09-05 往返 ¥1400 直飞（Trip.com 源，缓存价标记为「近期参考价」）。
- **Netlify 免费计划限制**：① API 不能写环境变量（403，需 UI 手动）；② 团队共享计算额度用超后全团队新部署被封锁，等月度重置或升级。
