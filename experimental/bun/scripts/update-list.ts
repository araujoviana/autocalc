#!/usr/bin/env bun
/** Update a saved price list IN PLACE from a detail-shaped payload file.
 *
 *   bun run scripts/update-list.ts <url_or_id> <payload.json>
 *
 * The payload must be the same shape share/detail returns:
 *   { name, totalPrice, billingMode?, cartListData: [...] }
 * This is the parity entry point for the old share.update (the CLI has no update command yet).
 * Holds no site-specific data: pass the id and payload file explicitly.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { AuthManager } from "../src/core/auth.ts";
import { ListSession, shareDetail } from "../src/core/lists.ts";
import { resolveConfig, profilePaths } from "../src/core/config.ts";
import { PublicTransport } from "../src/core/transport.ts";
import { CatalogCache } from "../src/core/cache.ts";

const [reference, payloadPath] = process.argv.slice(2);
if (!reference || !payloadPath) {
  console.error("usage: bun run scripts/update-list.ts <url_or_id> <payload.json>");
  process.exit(2);
}

const config = resolveConfig({});
const paths = profilePaths(config.profile!);
const auth = new AuthManager({
  profile: config.profile!, configDir: paths.configDir, profileDir: paths.profileDir,
  headed: !!config.headed, ...(config.executable ? { executable: config.executable } : {}),
});
const lists = new ListSession((method, url, body) => auth.call(method, url, body), () => auth.refresh());

try {
  const payload = JSON.parse(await readFile(payloadPath, "utf8")) as Record<string, unknown>;
  const cards = Array.isArray(payload.cartListData) ? payload.cartListData.length : 0;
  if (!cards) throw new Error("payload has no cartListData");
  await lists.update(reference, payload);

  // Read back from the public detail endpoint and report what actually landed.
  const detail = await shareDetail(new PublicTransport(new CatalogCache(join(homedir(), ".cache", "autocalc"))), reference);
  const total = detail.totalPrice && typeof detail.totalPrice === "object"
    ? (detail.totalPrice as Record<string, unknown>).amount : detail.totalPrice;
  console.log(JSON.stringify({
    id: reference, name: detail.name ?? null, cards: detail.cartListData.length,
    sent_cards: cards, total, ok: detail.cartListData.length === cards,
  }));
} finally {
  await auth.close();
}
