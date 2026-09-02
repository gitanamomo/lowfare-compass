#!/usr/bin/env node
// 一键 zip 部署到 Netlify（本项目站点未连 GitHub CI，用此脚本发布）。
// 用法：NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs
// 可选环境变量：NETLIFY_SITE_ID（默认为本站 51be0f97-ddbb-4f14-8e1b-74d0d33c6f2c）

import { mkdtemp, cp, mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SITE_ID = process.env.NETLIFY_SITE_ID || "51be0f97-ddbb-4f14-8e1b-74d0d33c6f2c";
const API = "https://api.netlify.com/api/v1";
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const token = process.env.NETLIFY_TOKEN;
if (!token) {
  console.error("缺少 NETLIFY_TOKEN 环境变量。在 Netlify 后台 User settings → Applications 生成后：");
  console.error("  NETLIFY_TOKEN=nfp_xxx node scripts/deploy-netlify.mjs");
  process.exit(1);
}

function api(path, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) }
  }).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Netlify API ${response.status}: ${payload.message || text.slice(0, 200)}`);
    return payload;
  });
}

async function buildZip() {
  const stage = await mkdtemp(join(tmpdir(), "lowfare-deploy-"));
  await mkdir(join(stage, "netlify/functions"), { recursive: true });
  await cp(join(ROOT, "index.html"), join(stage, "index.html"));
  await cp(join(ROOT, "netlify.toml"), join(stage, "netlify.toml"));
  await cp(join(ROOT, "netlify/functions/api.mjs"), join(stage, "netlify/functions/api.mjs"));
  const zipPath = join(stage, "deploy.zip");
  await execFileAsync("zip", ["-qr", zipPath, "."], { cwd: stage });
  return { zipPath, stage };
}

async function main() {
  const { zipPath, stage } = await buildZip();
  try {
    const zip = await readFile(zipPath);
    console.log(`打包完成：${zip.length} 字节（index.html + netlify.toml + netlify/functions/api.mjs）`);
    const deploy = await api(`/sites/${SITE_ID}/deploys`, {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: zip
    });
    console.log(`部署已创建：${deploy.id}，等待上线…`);

    const deadline = Date.now() + 5 * 60 * 1000;
    let state = deploy.state;
    while (!["ready", "error", "deadline"].includes(state)) {
      if (Date.now() > deadline) { state = "deadline"; break; }
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const current = await api(`/deploys/${deploy.id}`);
      state = current.state;
      console.log(`  状态：${state}`);
    }

    if (state !== "ready") {
      console.error(`部署未成功（${state}）。常见原因：团队计算额度用超（去 Netlify 后台 usage 页确认）。`);
      process.exit(2);
    }

    console.log("部署成功 ✅  正在验收 /api/health …");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const health = await fetch("https://gina-lowfare-passport.netlify.app/api/health").then((r) => r.json());
    const travelpayouts = health.providers?.find((p) => p.id === "travelpayouts");
    console.log(`health.ok = ${health.ok}`);
    for (const p of health.providers || []) console.log(`  ${p.id}: configured=${p.configured}（${p.capability}）`);
    if (!travelpayouts?.configured) {
      console.error("⚠️ travelpayouts 未生效：请检查 Netlify 后台环境变量 TRAVELPAYOUTS_TOKEN 是否已配置。");
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
