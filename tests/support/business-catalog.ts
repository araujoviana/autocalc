import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Catalog } from "../../src/core/catalog.ts";

const FIXTURES_DIR = join(import.meta.dir, "..", "fixtures", "compat");

export class SyntheticBusinessReader {
  private menuData: unknown;
  private labelsData: unknown;
  private productsData: Record<string, unknown>;

  constructor() {
    this.menuData = JSON.parse(readFileSync(join(FIXTURES_DIR, "menu.json"), "utf8"));
    this.labelsData = JSON.parse(readFileSync(join(FIXTURES_DIR, "labels.json"), "utf8"));
    this.productsData = JSON.parse(readFileSync(join(FIXTURES_DIR, "products.json"), "utf8"));
  }

  async get(url: string, options?: { mirror?: string; refresh?: boolean }): Promise<unknown> {
    if (url.includes("/menuInfo") || (options?.mirror && options.mirror.includes("menuInfo"))) {
      return this.menuData;
    }
    if (url.includes("/language")) {
      return this.labelsData;
    }
    const match =
      /urlPath=([^&]+).*region=([^&]+)/.exec(url) ||
      /intl\/product\/([^_]+)_general.*_([^_]+)_calc_productInfo/.exec(options?.mirror || url);
    if (match) {
      const service = match[1];
      const region = match[2];
      const key = `${service}_${region}`;
      if (Object.hasOwn(this.productsData, key)) {
        return this.productsData[key];
      }
      throw new Error(`SyntheticBusinessReader missing fixture for ${key} (${url})`);
    }
    throw new Error(`SyntheticBusinessReader rejected unexpected network call to unknown URL: ${url}`);
  }

  async getUncached(url: string): Promise<unknown> {
    return this.get(url);
  }

  async close(): Promise<void> {
    // No-op for synthetic reader
  }
}

export function createSyntheticBusinessCatalog(): {
  transport: SyntheticBusinessReader;
  catalog: Catalog;
} {
  const transport = new SyntheticBusinessReader();
  const catalog = new Catalog(transport as any);
  return { transport, catalog };
}
