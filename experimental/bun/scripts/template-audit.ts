import { homedir } from "node:os";
import { join } from "node:path";
import { allCards, compareCards, compareProducts } from "../tests/support/golden.ts";
import { rebuildCard } from "../tests/support/rebuild.ts";
import { CatalogCache } from "../src/core/cache.ts";
import { Catalog } from "../src/core/catalog.ts";
import { PublicTransport } from "../src/core/transport.ts";
import { RATE } from "../src/core/endpoints.ts";
import { inquiry } from "../src/core/pricing.ts";

const limit = process.argv[2] === undefined ? 8 : Number(process.argv[2]);
if (!Number.isInteger(limit) || limit < 1) throw new Error("Limit must be a positive integer");
const transport = new PublicTransport(new CatalogCache(process.env.AUTOCALC_CACHE ?? join(homedir(), ".cache", "autocalc")));
const catalog = new Catalog(transport);
try {
  const rows = await allCards();
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const selected = row.card.selectedProduct;
    const service = selected && typeof selected === "object" ? (selected as Record<string, unknown>).serviceCode : undefined;
    const region = selected && typeof selected === "object" ? (selected as Record<string, unknown>).region : undefined;
    if (process.env.AUTOCALC_AUDIT_REGION && region !== process.env.AUTOCALC_AUDIT_REGION) continue;
    if (typeof service !== "string") continue;
    const group = groups.get(service) ?? [];
    group.push(row); groups.set(service, group);
  }
  if (!rows.length || !groups.size) throw new Error("No private corpus cards found for the selected region");
  let failed = false;
  let matchedServices = 0;
  for (const [service, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    if (process.env.AUTOCALC_AUDIT_SERVICE && service.toLowerCase() !== process.env.AUTOCALC_AUDIT_SERVICE.toLowerCase()) continue;
    matchedServices++;
    if (!["ecs", "evs", "cce", "obs", "rds", "sfsturbo", "elb", "nat", "apig", "dline", "cbr", "apm", "waf", "function", "dew", "lts", "eip", "cci", "rabbitmq", "kafka", "nosql", "redis"].includes(service.toLowerCase())) {
      process.stdout.write(`${service}: no reconstruction available (${group.length} cards)\n`);
      continue;
    }
    const sample = group.slice(0, limit);
    let rewriteOk = 0, templateOk = 0, productsOk = 0, priceDifferences = 0, metadataDifferences = 0, errors = 0;
    const examples: string[] = [];
    for (const row of sample) {
      try {
        const rebuilt = await rebuildCard(row.card, { productInfo: (name, region) => catalog.productInfo(name, region), rate: body => inquiry(value => transport.post(RATE, value), body) });
        const rewrite = compareCards(rebuilt.rewriteValue, row.card.rewriteValue);
        const storedRewrite = row.card.rewriteValue && typeof row.card.rewriteValue === "object" ? row.card.rewriteValue as Record<string, unknown> : {};
        const template = compareCards(rebuilt.rewriteValue.template_RENDER, storedRewrite.template_RENDER);
        const products = compareProducts(rebuilt.selectedProduct, row.card.selectedProduct);
        const metadata = compareCards(rebuilt.selectedProduct, row.card.selectedProduct);
        if (metadata.length) metadataDifferences++;
        if (products.some(path => /(?:^|\.)(?:amount|originalAmount|discountAmount)$/.test(path))) priceDifferences++;
        if (!rewrite.length) rewriteOk++;
        if (!template.length) templateOk++;
        if (!products.length) productsOk++;
        if (!examples.length) examples.push(...rewrite.slice(0, 8).map(path => `rewriteValue.${path}`), ...products.slice(0, Math.max(0, 8 - rewrite.length)).map(path => `selectedProduct.${path}`));
      } catch (error) { errors++; if (!examples.length) examples.push(error instanceof Error ? error.message : String(error)); }
    }
    if (rewriteOk !== sample.length || productsOk !== sample.length || errors) failed = true;
    process.stdout.write(`${service}: rewrite ${rewriteOk}/${sample.length}, template ${templateOk}/${sample.length}, products ${productsOk}/${sample.length}, price differences ${priceDifferences}, catalog/metadata differences ${metadataDifferences}, errors ${errors}\n`);
    for (const example of examples) process.stdout.write(`  ${example}\n`);
  }
  if (!matchedServices) throw new Error("No private corpus cards found for the selected service and region");
  if (failed) process.exitCode = 1;
} finally { await transport.close(); }
