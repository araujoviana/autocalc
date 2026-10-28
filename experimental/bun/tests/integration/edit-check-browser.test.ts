import { expect, test } from "bun:test";
import { BrowserManager } from "../../src/core/browser.ts";
import { editCheckCard } from "../../src/core/edit-check-browser.ts";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("missing calculator internals fail closed", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("<div id='app'>No application</div>", { headers: { "content-type": "text/html" } }) });
  const manager = new BrowserManager();
  const directory = await mkdtemp(join(tmpdir(), "autocalc-shot-")), screenshotPath = join(directory, "card.png");
  try {
    expect(await editCheckCard(manager, 0, { selectedProduct: { serviceCode: "ecs", region: "r", amount: 1 } }, { pageUrl: server.url.href, timeout: 3000, screenshotPath })).toMatchObject({ status: "unavailable", reason: "Calculator stores did not become ready" });
    expect((await readFile(screenshotPath)).subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }
  finally { await manager.close(); server.stop(); await rm(directory, { recursive: true, force: true }); }
}, 30000);

test("Edit check ignores unrelated ratings and judges the last matching response", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/rate") { const body = await request.json() as { regionId: string; amount: number }; return Response.json({ amount: body.amount }); }
    return new Response(`<div id="app"></div><button class="collapse-card-item-header-operation-item">Edit</button><script>
      const cart = { cartListDataBase: [], totalCartPrice: {}, MODIFY_CARTLISTDATABASE(o) { this.cartListDataBase = o.originData; } };
      document.querySelector('#app').__vue_app__ = {config:{globalProperties:{$pinia:{_s:new Map([['cartInfo',cart],['globalInfo',{currencyData:{}}]])}}}};
      const db = indexedDB.open('keyval-store'); db.onupgradeneeded = () => db.result.createObjectStore('keyval');
      document.querySelector('button').onclick = async () => { for (const [regionId,amount] of [['other',99],['r',8],['r',10]]) { await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId,amount,productInfos:[{resourceType:'type.vm',resourceSpecCode:'x',productNum:1}]})}); await new Promise(resolve => setTimeout(resolve,100)); } };
    </script>`, { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try {
    const card = { selectedProduct: { serviceCode: "ecs", region: "r", amount: 10, productAllInfos: [{ resourceType: "type.vm", resourceSpecCode: "x", productNum: 1 }] } };
    expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, rateUrl: new URL("/rate", server.url).href, timeout: 5000 })).toMatchObject({ status: "ok", edit: 10 });
  } finally { await manager.close(); server.stop(); }
}, 20000);

const card = { selectedProduct: { serviceCode: "ecs", region: "r", amount: 10, productAllInfos: [{ resourceType: "type.vm", resourceSpecCode: "x", productNum: 1 }] } };
function fixture(extra: string, onEdit: string): string {
  return `<div id="app"></div>${extra}<button class="collapse-card-item-header-operation-item">Edit</button><script>
    const cart = { cartListDataBase: [], totalCartPrice: {}, MODIFY_CARTLISTDATABASE(o) { this.cartListDataBase = o.originData; } };
    document.querySelector('#app').__vue_app__ = {config:{globalProperties:{$pinia:{_s:new Map([['cartInfo',cart],['globalInfo',{currencyData:{}}]])}}}};
    const db = indexedDB.open('keyval-store'); db.onupgradeneeded = () => db.result.createObjectStore('keyval');
    document.querySelector('.collapse-card-item-header-operation-item').onclick = async () => { ${onEdit} };
  </script>`;
}

test("Edit check dismisses the calculator guide using its Close button", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const guide = '<div class="tiny-dialog-box__wrapper guide-dialog"><button aria-label="Close" onclick="this.parentElement.remove()">×</button></div>';
    const click = `await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.vm',resourceSpecCode:'x',productNum:1}]})});`;
    return new Response(fixture(guide, click), { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, rateUrl: new URL("/rate", server.url).href, timeout: 3000 })).toMatchObject({ status: "ok", edit: 10 }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check fails closed when a known dialog remains visible", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response(fixture('<div class="privacy-popup">Privacy</div>', ''), { headers: { "content-type": "text/html" } }) });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, timeout: 1500 })).toMatchObject({ status: "unavailable", reason: "A calculator dialog blocks Edit" }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check fails closed if no matching rating arrives", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response(fixture('', ''), { headers: { "content-type": "text/html" } }) });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, timeout: 1000 })).toMatchObject({ status: "unavailable", reason: "Rating responses did not settle" }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check reports cancellation during page readiness", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response("<div id='app'>Waiting</div>", { headers: { "content-type": "text/html" } }) });
  const manager = new BrowserManager(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 500);
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, timeout: 5000, signal: controller.signal })).toMatchObject({ status: "unavailable", reason: "Edit check cancelled" }); }
  finally { clearTimeout(timer); await manager.close(); server.stop(); }
}, 15000);

test("Edit check preserves a calculator advisory and rejects invalid amounts", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: null });
    const click = `document.getElementById('warning').style.display='block'; await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.vm',resourceSpecCode:'x',productNum:1}]})});`;
    return new Response(fixture('<div id="warning" style="display:none">No data matched</div>', click), { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, rateUrl: new URL("/rate", server.url).href, timeout: 3000 })).toMatchObject({ status: "unavailable", reason: "Edit amount is not finite", warnings: ["Calculator reported: No data matched"] }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check ignores another ECS request sharing only a disk", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const click = `await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.vm',resourceSpecCode:'other',productNum:1},{resourceType:'type.volume',resourceSpecCode:'GPSSD',productNum:1}]})});`;
    return new Response(fixture('', click), { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  const target = { selectedProduct: { ...card.selectedProduct, productAllInfos: [...card.selectedProduct.productAllInfos, { resourceType: "type.volume", resourceSpecCode: "GPSSD", productNum: 1 }] } };
  try { expect(await editCheckCard(manager, 0, target, { pageUrl: server.url.href, rateUrl: new URL("/rate", server.url).href, timeout: 1000 })).toMatchObject({ status: "unavailable", reason: "Rating responses did not settle" }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("OBS Edit check correlates the selected usage line", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const click = `await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.obs',resourceSpecCode:'obs.001',usageFactor:'size',usageValue:10,usageMeasureId:10,productNum:720}]})});`;
    return new Response(fixture('', click), { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  const obs = { selectedProduct: { serviceCode: "obs", region: "r", amount: 10, productAllInfos: [{ resourceType: "type.obs", resourceSpecCode: "obs.001", usageFactor: "size", usageValue: 10, usageMeasureId: 10, productNum: 720 }] } };
  try { expect(await editCheckCard(manager, 0, obs, { pageUrl: server.url.href, rateUrl: new URL('/rate', server.url).href, timeout: 5000 })).toMatchObject({ status: "ok", edit: 10 }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check dismisses a delayed featured-products guide", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const click = `await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.vm',resourceSpecCode:'x',productNum:1}]})});`;
    const overlay = `<script>if(location.search) { document.querySelector('.collapse-card-item-header-operation-item').disabled = true; setTimeout(() => document.querySelector('.collapse-card-item-header-operation-item').disabled = false, 500); setTimeout(() => { const d=document.createElement('div'); d.className='tiny-dialog-box__wrapper'; d.style.cssText='position:fixed;inset:0;z-index:100;background:white'; d.innerHTML='<div>Featured Products All in One Place</div><button aria-label="Close" onclick="this.parentElement.remove()">x</button>'; document.body.append(d); }, 100); }</script>`;
    return new Response(fixture('', click) + overlay, { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, rateUrl: new URL('/rate', server.url).href, timeout: 5000 })).toMatchObject({ status: "ok", edit: 10 }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("OBS Edit never passes when the calculator reports unmatched data", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const click = `document.getElementById('warning').style.display='block'; await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.obs',resourceSpecCode:'obs.001',usageFactor:'size',usageValue:10,usageMeasureId:10,productNum:720}]})});`;
    return new Response(fixture('<div id="warning" style="display:none">No data matched</div>', click), { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  const obs = { selectedProduct: { serviceCode: "obs", region: "r", amount: 10, productAllInfos: [{ resourceType: "type.obs", resourceSpecCode: "obs.001", usageFactor: "size", usageValue: 10, usageMeasureId: 10, productNum: 720 }] } };
  try { expect(await editCheckCard(manager, 0, obs, { pageUrl: server.url.href, rateUrl: new URL('/rate', server.url).href, timeout: 4000 })).toMatchObject({ status: "mismatch", reason: expect.stringContaining("No data matched") }); }
  finally { await manager.close(); server.stop(); }
}, 15000);

test("Edit check can invoke the card in the collapsed temporary cart", async () => {
  const server = Bun.serve({ port: 0, async fetch(request) {
    if (new URL(request.url).pathname === "/rate") return Response.json({ amount: 10 });
    const click = `await fetch('/rate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({regionId:'r',productInfos:[{resourceType:'type.vm',resourceSpecCode:'x',productNum:1}]})});`;
    const html = fixture('', click).replace('<button class="collapse-card-item-header-operation-item">Edit</button>', '<div class="tab-cart-small" style="display:none"><button class="collapse-card-item-header-operation-item">Edit</button></div>');
    return new Response(html, { headers: { "content-type": "text/html" } });
  } });
  const manager = new BrowserManager();
  try { expect(await editCheckCard(manager, 0, card, { pageUrl: server.url.href, rateUrl: new URL('/rate', server.url).href, timeout: 1200 })).toMatchObject({ status: "ok", edit: 10 }); }
  finally { await manager.close(); server.stop(); }
}, 15000);
