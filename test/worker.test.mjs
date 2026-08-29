import test from "node:test";
import assert from "node:assert/strict";
import worker, { dedupeOffers, demoOffers, normalizeOffer, offerFingerprint, validateSearch } from "../worker.js";

const baseFlex = {
  origins: ["CSX"], earliest: "2026-10-01", latest: "2026-12-31",
  stayMin: 3, stayMax: 9, budget: 3000, maxStops: 1
};

test("固定日期参数标准化", () => {
  const result = validateSearch({ origins: ["csx", "CSX", "sha"], departDate: "2026-10-01", returnDate: "2026-10-08", budget: 1800, maxStops: 0 }, "fixed");
  assert.deepEqual(result.origins, ["CSX", "SHA"]);
  assert.equal(result.maxStops, 0);
  assert.equal(result.cabin, "ECONOMY");
});

test("最多只允许三个出发地", () => {
  assert.throws(() => validateSearch({ ...baseFlex, origins: ["CSX", "SHA", "CAN", "SZX"] }, "flexible"), /1–3/);
});

test("时间窗口不能超过十二个月", () => {
  assert.throws(() => validateSearch({ ...baseFlex, earliest: "2026-01-01", latest: "2027-02-01" }, "flexible"), /12 个月/);
});

test("演示结果满足预算和停留范围并按价格排序", () => {
  const input = validateSearch(baseFlex, "flexible");
  const offers = demoOffers(input, "flexible");
  assert.ok(offers.length > 0);
  assert.ok(offers.every((offer) => offer.priceCny <= input.budget));
  assert.ok(offers.every((offer) => offer.stayDays >= 3 && offer.stayDays <= 9));
  assert.deepEqual(offers.map((o) => o.priceCny), offers.map((o) => o.priceCny).sort((a, b) => a - b));
});

test("直飞筛选下演示结果不包含中转", () => {
  const input = validateSearch({ ...baseFlex, maxStops: 0 }, "flexible");
  const offers = demoOffers(input, "flexible");
  assert.ok(offers.every((offer) => offer.stops === 0));
});

test("同一行程多来源只保留最低价", () => {
  const common = { origin: "CSX", destination: "BKK", departDate: "2026-10-01", returnDate: "2026-10-07", adults: 1, cabin: "ECONOMY" };
  const result = dedupeOffers([
    normalizeOffer({ ...common, priceCny: 1900, provider: "A" }),
    normalizeOffer({ ...common, priceCny: 1600, provider: "B" })
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].priceCny, 1600);
  assert.equal(result[0].otherSourceCount, 1);
});

test("历史价格指纹包含航线、日期、舱位和人数", () => {
  assert.equal(offerFingerprint({ origin: "csx", destination: "bkk", departDate: "2026-10-01", returnDate: "2026-10-07", cabin: "ECONOMY", adults: 1 }), "CSX|BKK|2026-10-01|2026-10-07|ECONOMY|1");
});

test("未配置供应商时搜索接口返回明确演示标识", async () => {
  const request = new Request("https://example.test/api/search/flexible", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(baseFlex) });
  const response = await worker.fetch(request, { ALLOW_DEMO: "true" });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.meta.demo, true);
  assert.ok(payload.meta.warnings[0].includes("演示数据"));
});

test("演示行程不伪装成实时复价", async () => {
  const offer = demoOffers(validateSearch(baseFlex, "flexible"), "flexible")[0];
  const request = new Request("https://example.test/api/refresh", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ offer }) });
  const response = await worker.fetch(request, {});
  const payload = await response.json();
  assert.equal(payload.data.status, "demo");
  assert.equal(payload.meta.demo, true);
});
