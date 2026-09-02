#!/usr/bin/env node
// 一键部署到 Netlify（本项目站点未连 GitHub CI，用此脚本发布）。
// 用法：NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs
// 可选环境变量：NETLIFY_SITE_ID（默认为本站 9dbe994e-a7d8-4703-a6a9-cecdbcfc3d4d，lowfare-compass）
//
// ⚠️ 2026-09-02 教训：裸 zip API（POST /sites/{id}/deploys）**不会注册 Function**——
// 线上首页能开但 /api/* 全部 404。必须走 Netlify CLI（本地 esbuild 打包 Function 后推送）。
// 本脚本要求环境里已装 netlify-cli（本项目隔离 workspace 已装：
// /Users/gitana/.workbuddy/binaries/node/workspace/node_modules/netlify-cli）。

import { mkdtemp, cp, mkdir, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SITE_ID = process.env.NETLIFY_SITE_ID || "9dbe994e-a7d8-4703-a6a9-cecdbcfc3d4d";
const HEALTH_URL = process.env.HEALTH_URL || "https://lowfare-compass.netlify.app/api/health";
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const token = process.env.NETLIFY_TOKEN;
if (!token) {
  console.error("缺少 NETLIFY_TOKEN 环境变量。在 Netlify 后台 User settings → Applications 生成后：");
  console.error("  NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs");
  process.exit(1);
}

// 定位 netlify-cli 的 bin/run.js
const CLI_CANDIDATES = [
  process.env.NETLIFY_CLI_PATH,
  "/Users/gitana/.workbuddy/binaries/node/workspace/node_modules/netlify-cli/bin/run.js"
].filter(Boolean);

async function findCli() {
  for (const p of CLI_CANDIDATES) {
    try { await access(p); return p; } catch { /* 继续找 */ }
  }
  console.error("找不到 netlify-cli。请先安装到隔离 workspace：");
  console.error("  cd /Users/gitana/.workbuddy/binaries/node/workspace && npm install netlify-cli");
  process.exit(1);
}

async function main() {
  const cli = await findCli();
  const node = process.execPath;

  // 组装部署目录：前端 + netlify.toml + worker.js（api.mjs 相对引用它）+ Function 源码
  const stage = await mkdtemp(join(tmpdir(), "lowfare-deploy-"));
  await mkdir(join(stage, "netlify/functions"), { recursive: true });
  await cp(join(ROOT, "index.html"), join(stage, "index.html"));
  await cp(join(ROOT, "netlify.toml"), join(stage, "netlify.toml"));
  await cp(join(ROOT, "worker.js"), join(stage, "worker.js"));
  await cp(join(ROOT, "netlify/functions/api.mjs"), join(stage, "netlify/functions/api.mjs"));
  console.log(`部署目录就绪：${stage}`);

  try {
    const { stdout } = await execFileAsync(node, [
      cli, "deploy",
      "--site", SITE_ID,
      "--dir", stage,
      "--functions", join(stage, "netlify/functions"),
      "--prod"
    ], {
      env: { ...process.env, NETLIFY_AUTH_TOKEN: token },
      maxBuffer: 10 * 1024 * 1024
    });
    const lines = stdout.split("\n").filter((l) => /Deploy is live|Production URL|Deploy complete|Error/i.test(l));
    console.log(lines.join("\n") || stdout.slice(-400));

    console.log("正在验收 /api/health …");
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const health = await fetch(HEALTH_URL).then((r) => r.json());
    const travelpayouts = health.providers?.find((p) => p.id === "travelpayouts");
    console.log(`health.ok = ${health.ok}`);
    for (const p of health.providers || []) console.log(`  ${p.id}: configured=${p.configured}（${p.capability}）`);
    if (!health.ok) { console.error("⚠️ /api/health 返回异常"); process.exit(2); }
    if (!travelpayouts?.configured) {
      console.error("⚠️ travelpayouts 未生效：请到 Netlify 后台 Site configuration → Environment variables 手动加 TRAVELPAYOUTS_TOKEN（免费计划 API 写不了 env），加完重新跑本脚本。");
      process.exit(3);
    }
    console.log("验收通过 ✅");
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
