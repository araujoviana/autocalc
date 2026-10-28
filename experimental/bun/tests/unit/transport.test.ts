import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CatalogCache } from "../../src/core/cache.ts";
import { PublicTransport } from "../../src/core/transport.ts";

test("uses mirror first, falls back to API, caches and bypasses mirror on refresh", async () => {
  const calls: string[] = [];
  const server = Bun.serve({ port: 0, fetch(req) {
    const path = new URL(req.url).pathname;
    calls.push(path);
    return path === "/mirror" ? new Response("unavailable", { status: 503 }) : Response.json({ value: calls.length });
  } });
  const directory = await mkdtemp(join(tmpdir(), "autocalc-transport-"));
  const transport = new PublicTransport(new CatalogCache(directory));
  try {
    const primary = new URL("/api", server.url).href;
    const mirror = new URL("/mirror", server.url).href;
    expect(await transport.get(primary, { mirror })).toEqual({ value: 2 });
    expect(await transport.get(primary, { mirror })).toEqual({ value: 2 });
    expect(await transport.get(primary, { mirror, refresh: true })).toEqual({ value: 3 });
    expect(calls).toEqual(["/mirror", "/api", "/api"]);
  } finally { await transport.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("rating requests are posted as JSON without caching", async () => {
  const server = Bun.serve({ port: 0, async fetch(req) { return Response.json({ input: await req.json() }); } });
  const directory = await mkdtemp(join(tmpdir(), "autocalc-rating-"));
  const transport = new PublicTransport(new CatalogCache(directory));
  try { expect(await transport.post(server.url.href, { a: 1 })).toEqual({ status: 200, body: { input: { a: 1 } } }); }
  finally { await transport.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("uncached requests never reuse responses", async () => {
  let count = 0;
  const server = Bun.serve({ port: 0, fetch() { return Response.json({ count: ++count }); } });
  const directory = await mkdtemp(join(tmpdir(), "autocalc-uncached-"));
  const transport = new PublicTransport(new CatalogCache(directory));
  try {
    expect(await transport.getUncached(server.url.href)).toEqual({ count: 1 });
    expect(await transport.getUncached(server.url.href)).toEqual({ count: 2 });
  } finally { await transport.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
});

test("concurrent anonymous requests share one request context", async () => {
  const { request } = await import("playwright");
  let contexts = 0;
  const factory: typeof request.newContext = async options => {
    contexts++;
    await Bun.sleep(50);
    return request.newContext(options);
  };
  const server = Bun.serve({ port: 0, fetch: () => Response.json({ ok: true }) });
  const directory = await mkdtemp(join(tmpdir(), "autocalc-concurrency-"));
  const transport = new PublicTransport(new CatalogCache(directory), 60000, factory);
  try {
    const results = await Promise.all(Array.from({ length: 5 }, () => transport.getUncached(server.url.href)));
    expect(results.every(result => (result as { ok: boolean }).ok)).toBe(true);
    expect(contexts).toBe(1);
  } finally {
    await transport.close();
    server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("closing during request initialization disposes the eventual context", async () => {
  const { request } = await import("playwright");
  let began!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { began = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  let disposed = false;
  const factory: typeof request.newContext = async options => {
    began();
    await gate;
    const context = await request.newContext(options), dispose = context.dispose.bind(context);
    context.dispose = async (...args) => {
      await dispose(...args);
      disposed = true;
    };
    return context;
  };
  const directory = await mkdtemp(join(tmpdir(), "autocalc-close-init-"));
  const transport = new PublicTransport(new CatalogCache(directory), 60000, factory);
  try {
    const pending = transport.getUncached("http://127.0.0.1:1/");
    const rejected = pending.then(() => undefined, error => error as unknown);
    await started;
    const closing = transport.close();
    release();
    expect(await rejected).toMatchObject({ code: "CANCELLED" });
    await closing;
    expect(disposed).toBe(true);
    // calling close again is idempotent
    await transport.close();
  } finally {
    release();
    await transport.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("cannot make requests after transport is closed", async () => {
  const directory = await mkdtemp(join(tmpdir(), "autocalc-closed-"));
  const transport = new PublicTransport(new CatalogCache(directory));
  await transport.close();
  await expect(transport.getUncached("http://127.0.0.1:1/")).rejects.toMatchObject({ code: "CANCELLED" });
  await expect(transport.post("http://127.0.0.1:1/", {})).rejects.toMatchObject({ code: "CANCELLED" });
  await rm(directory, { recursive: true, force: true });
});

test("POST connection failures return a redacted upstream error", async () => {
  const directory = await mkdtemp(join(tmpdir(), "autocalc-post-error-"));
  const transport = new PublicTransport(new CatalogCache(directory));
  try {
    const failure = await transport.post("http://127.0.0.1:1/private-token", {}).then(() => undefined, error => error as Error & { code?: string });
    expect(failure?.code).toBe("UPSTREAM");
    expect(failure?.message).not.toContain("private-token");
  } finally { await transport.close(); await rm(directory, { recursive: true, force: true }); }
});
