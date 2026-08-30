# TODO — Gina的低价护照（lowfare-compass）

> 更新：2026-08-30。跨会话续作用的待办清单，做完一项勾一项。

## P0（阻塞上线）

- [ ] **等待 Netlify 团队额度重置后重新部署**（团队 5 站共享额度已用超，预计 9/1 重置）
  - 部署方式：本地 zip 部署 `POST /api/v1/sites/51be0f97-ddbb-4f14-8e1b-74d0d33c6f2c/deploys`，包内含 `index.html` + `netlify.toml` + `netlify/functions/api.mjs`（本次已在 /tmp/netlify-deploy.zip 验证过打包结构）
  - 部署后验收：`curl https://gina-lowfare-passport.netlify.app/api/health` → `travelpayouts.configured: true`
  - 环境变量 `TRAVELPAYOUTS_TOKEN` 已由用户在 Netlify UI 手动配置（免费计划 API 写不了 env）
- [ ] **Amadeus 数据源决策**（2026-07-17 Amadeus 自服务门户已关停，旧 key 失效、新注册暂停，详见下方「背景」）
  - 方案 A：仅用 Travelpayouts（已可用），实时复价降级为提示用户去供应商页复核 —— 改动最小
  - 方案 B：接入替代自服务 API（如 Duffel，NDC 直连 300+ 航司，需注册评估免费额度）
  - 方案 C：仅做静态演示站
  - ⚠️ 用户手里若有 Amadeus key，可先发来验证（预期已失效，验证只需 1 次调用）

## P1

- [ ] 若选方案 B：在 `worker.js` 新增供应商适配（参照现有 `searchAmadeus()` 结构，返回 `normalizeOffer()` 字段后加入 `searchAll()`），同步改测试
- [ ] 重新部署后整站验收：三种搜索模式、住宿匹配、复价跳转、Safari + iPhone 尺寸

## P2（文档与仓库卫生）

- [ ] **修 README 部署章节漂移**：实际是「本地 zip 部署」，非 GitHub 持续部署；「数据源配置」章节中 Amadeus 相关描述已过时（自服务关停）
- [ ] 检查是否要把 Netlify 部署流程写成 `scripts/deploy-netlify.mjs`（避免每次手敲 curl）

## P3（可选 / 收尾）

- [ ] 验收完成后提醒用户**撤销 Netlify token**（nfp_…6011）
- [ ] Booking.com Demand API 合作申请（当前未申请）
- [ ] D1 价格历史功能在 Netlify 路径下无数据库支撑，属空转（Cloudflare 备用方案才有），考虑在 UI 隐藏或说明

## 背景（2026-08-30 实测结论）

- **Amadeus 自服务已死**：developers.amadeus.com 自服务门户于 2026-07-17 停用，Self-Service key 全部失效，新注册 2026 年春已暂停。此前免费政策（测试环境免费 + 生产每月免费额度，如 Flight Offers Search 2000 次/月）随关停一并终止。替代品：Duffel（自服务、无需 IATA）、Ignav 等。来源：developers.amadeus.com 官网公告、PhocusWire 2026-02 报道、apis.io 定价页、thunderbit/tripgic 迁移指南。
- **Travelpayouts 已验证可用**：token 实测 SZX→BKK 2026-09-05 往返 ¥1400 直飞（Trip.com 源，缓存价标记为「近期参考价」）。
- **Netlify 免费计划限制**：① API 不能写环境变量（403，需 UI 手动）；② 团队共享计算额度用超后全团队新部署被封锁，等月度重置或升级。
