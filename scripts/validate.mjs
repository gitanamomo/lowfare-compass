import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const files = {
  html: await readFile(new URL("../index.html", import.meta.url), "utf8"),
  worker: await readFile(new URL("../worker.js", import.meta.url), "utf8"),
  netlifyFunction: await readFile(new URL("../netlify/functions/api.mjs", import.meta.url), "utf8"),
  netlifyConfig: await readFile(new URL("../netlify.toml", import.meta.url), "utf8"),
  schema: await readFile(new URL("../schema.sql", import.meta.url), "utf8"),
  gitignore: await readFile(new URL("../.gitignore", import.meta.url), "utf8")
};

for (const id of ["form-fixed", "form-flexible", "form-destination", "settingsDialog", "resultList", "calendarGrid"]) {
  assert.match(files.html, new RegExp(`id=["']${id}["']`), `index.html 缺少 ${id}`);
}
assert.ok(files.html.includes("Gina的低价护照"), "品牌名称未更新");
for (const route of ["/api/places", "/api/search/fixed-dates", "/api/search/flexible", "/api/search/destination", "/api/refresh", "/api/price-history", "/api/stays/search"]) {
  assert.ok(files.worker.includes(route), `worker.js 缺少 ${route}`);
}
assert.ok(files.schema.includes("price_observations"), "缺少历史价格表");
assert.match(files.netlifyFunction, /path:\s*["']\/api\/\*["']/, "Netlify Function 缺少同域 API 路由");
assert.match(files.netlifyFunction, /rateLimit/, "Netlify Function 缺少限流");
assert.match(files.netlifyConfig, /publish\s*=\s*["']dist["']/, "Netlify 发布目录不正确");
assert.match(files.gitignore, /\.dev\.vars/);
assert.match(files.gitignore, /\.env/);

const forbidden = [/sk_live_[A-Za-z0-9]+/, /client_secret\s*[=:]\s*["'][^"']+["']/i, /TRAVELPAYOUTS_TOKEN\s*[=:]\s*["'][^"']+["']/];
for (const pattern of forbidden) {
  assert.doesNotMatch(files.html, pattern, "前端疑似包含密钥");
  assert.doesNotMatch(files.worker, pattern, "Worker 源码疑似硬编码密钥");
  assert.doesNotMatch(files.netlifyFunction, pattern, "Netlify Function 疑似硬编码密钥");
}

console.log("静态验证通过：三种机票模式、住宿匹配、七个 API、Netlify 限流、D1 schema 和密钥防护均存在。");
