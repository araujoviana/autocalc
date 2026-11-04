import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CatalogCache, cacheKey } from "../../src/core/cache.ts";

test("cache keys normalize query order and expired or corrupt data misses", async () => {
  expect(cacheKey("https://example.test/a?b=2&a=1")).toBe(cacheKey("https://example.test/a?a=1&b=2"));
  const directory = await mkdtemp(join(tmpdir(), "autocalc-cache-"));
  try {
    const cache = new CatalogCache(directory, 60);
    await cache.set("https://example.test/a", { result: 1 });
    expect(await cache.get("https://example.test/a")).toEqual({ result: 1 });
    const expired = new CatalogCache(directory, 0);
    expect(await expired.get("https://example.test/a")).toBeUndefined();
    await writeFile(cache.pathFor("https://example.test/a"), "{");
    expect(await cache.get("https://example.test/a")).toBeUndefined();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
