import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { request } from "playwright";
import { PAGE } from "../src/core/endpoints.ts";
import { bundleVersion } from "./bundle-args.ts";
const http = await request.newContext({ timeout: 60000 });
try {
  let version = bundleVersion(process.argv.slice(2));
  if (!version) {
    const page = await http.get(PAGE);
    if (!page.ok()) throw new Error(`Calculator page returned HTTP ${page.status()}`);
    version = /CBC-PortalCalculator\/([0-9.]+)/.exec(await page.text())?.[1];
    if (!version) throw new Error("Calculator bundle version not found");
  }
  const bundle = await http.get(`https://portal.hc-cdn.com/CBC-PortalCalculator/${version}/framework.js`);
  if (!bundle.ok()) throw new Error(`Bundle returned HTTP ${bundle.status()}`);
  const directory = join(import.meta.dir, "../.cache/bundle");
  await mkdir(directory, { recursive: true });
  const output = join(directory, `framework-${version}.js`);
  await writeFile(output, await bundle.body());
  process.stdout.write(`${output}\n`);
} finally { await http.dispose(); }
