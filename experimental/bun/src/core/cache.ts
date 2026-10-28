import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { logError } from "./logger.ts";

const entry = z.object({ timestamp: z.number().finite(), data: z.unknown() });
export function cacheKey(input: string): string {
  const url = new URL(input);
  url.searchParams.sort();
  return createHash("sha256").update(url.toString()).digest("hex");
}
export class CatalogCache {
  constructor(private readonly directory: string, private readonly ttlSeconds = 86400) {}
  pathFor(url: string): string { return join(this.directory, "v1", `${cacheKey(url)}.json`); }
  async get(url: string): Promise<unknown | undefined> {
    try {
      const parsed = entry.safeParse(JSON.parse(await readFile(this.pathFor(url), "utf8")) as unknown);
      if (!parsed.success) { logError("Ignoring an invalid catalog cache entry"); return undefined; }
      if (Date.now() - parsed.data.timestamp >= this.ttlSeconds * 1000) return undefined;
      return parsed.data.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") logError("Ignoring an unreadable catalog cache entry");
      return undefined;
    }
  }
  async set(url: string, data: unknown): Promise<void> {
    const directory = join(this.directory, "v1");
    await mkdir(directory, { recursive: true });
    const target = this.pathFor(url);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify({ timestamp: Date.now(), data }), { mode: 0o600 });
      await rename(temporary, target);
    } finally { await unlink(temporary).catch(() => undefined); }
  }
}
