import { request } from "playwright";
import type { APIRequestContext } from "playwright";
import { PAGE } from "./endpoints.ts";
import { CalculatorError } from "./errors.ts";
import type { CatalogCache } from "./cache.ts";

export class PublicTransport {
  private requestContext: APIRequestContext | undefined;
  private requestStarting: Promise<APIRequestContext> | undefined;
  private requestEpoch = 0;
  private closing: Promise<void> | undefined;
  private closed = false;

  constructor(
    private readonly cache: CatalogCache,
    private readonly timeout = 60000,
    private readonly requestFactory: typeof request.newContext = request.newContext.bind(request),
  ) {}

  private async getContext(): Promise<APIRequestContext> {
    if (this.closed || this.closing) {
      throw new CalculatorError("CANCELLED", "Transport is closed");
    }
    if (this.requestContext) return this.requestContext;
    if (!this.requestStarting) {
      const epoch = this.requestEpoch;
      const starting = (async () => {
        if (this.closed || epoch !== this.requestEpoch) {
          throw new CalculatorError("CANCELLED", "Transport is closed");
        }
        let context: APIRequestContext;
        try {
          context = await this.requestFactory({
            timeout: this.timeout,
            extraHTTPHeaders: {
              Origin: "https://www.huaweicloud.com",
              Referer: PAGE,
              "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
          });
        } catch (error) {
          if (this.closed || epoch !== this.requestEpoch) {
            throw new CalculatorError("CANCELLED", "Transport is closed");
          }
          throw error;
        }
        if (this.closed || epoch !== this.requestEpoch) {
          await context.dispose().catch(() => undefined);
          throw new CalculatorError("CANCELLED", "Transport is closed");
        }
        this.requestContext = context;
        return context;
      })().finally(() => {
        if (this.requestStarting === starting) this.requestStarting = undefined;
      });
      this.requestStarting = starting;
    }
    return this.requestStarting;
  }

  private async fetch(url: string): Promise<unknown> {
    let response;
    try {
      response = await (await this.getContext()).get(url);
    } catch (error) {
      if (error instanceof CalculatorError) throw error;
      throw new CalculatorError(
        "UPSTREAM",
        "Could not reach the calculator endpoint",
        "Check network connectivity and try again.",
      );
    }
    if (!response.ok()) {
      throw new CalculatorError("UPSTREAM", `Request failed with HTTP ${response.status()}`);
    }
    try {
      return (await response.json()) as unknown;
    } catch {
      throw new CalculatorError("UNEXPECTED_RESPONSE", "Upstream returned invalid JSON");
    }
  }

  async getUncached(url: string): Promise<unknown> {
    return this.fetch(url);
  }

  async post(url: string, data: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
    let response;
    try {
      response = await (await this.getContext()).post(url, { data });
    } catch (error) {
      if (error instanceof CalculatorError) throw error;
      throw new CalculatorError(
        "UPSTREAM",
        "Could not reach the calculator endpoint",
        "Check network connectivity and try again.",
      );
    }
    let body: unknown;
    try {
      body = (await response.json()) as unknown;
    } catch {
      body = null;
    }
    return { status: response.status(), body };
  }

  async get(url: string, options: { mirror?: string; refresh?: boolean } = {}): Promise<unknown> {
    if (!options.refresh) {
      const cached = await this.cache.get(url);
      if (cached !== undefined) return cached;
      if (options.mirror) {
        try {
          const result = await this.fetch(options.mirror);
          await this.cache.set(url, result);
          return result;
        } catch {
          /* A mirror failure falls back to the primary endpoint. */
        }
      }
    }
    const result = await this.fetch(url);
    await this.cache.set(url, result);
    return result;
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.requestEpoch++;
    const current = this.requestContext;
    const starting = this.requestStarting;
    this.requestContext = undefined;
    this.requestStarting = undefined;
    this.closing = (async () => {
      const results = await Promise.allSettled([
        current?.dispose(),
        starting?.then(ctx => ctx.dispose()).catch(() => undefined),
      ]);
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    })();
    return this.closing;
  }
}
