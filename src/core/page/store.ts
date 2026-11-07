/** Reads from the calculator page's own state, and the DOM actions the driver needs.
 *
 * All page JavaScript lives in LIB and is called by name through `js`, so each page access is one
 * auditable function and tests fake the page by answering on `fn`. Port of autocalc/page/store.py;
 * the vnode walk from #app, template-render's valueWatcher and the cartInfo store are described in
 * docs/explanation/huawei/page-encoder.md.
 */
export const CARD_KEYS = ["buyUrl", "rewriteValue", "selectedProduct"] as const;
export const OVERLAYS = ".guide-dialog, .v-modal, .privacy-popup";
const VERSION = /CBC-PortalCalculator\/([0-9.]+)\//;

export const LIB = String.raw`
const appEl = document.querySelector('#app');
const app = appEl && appEl.__vue_app__;
const plain = (v) => JSON.parse(JSON.stringify(v === undefined ? null : v));
let snapshot;
function findAll(pred) {
  if (snapshot) return snapshot.filter(pred);
  const out = [], seen = new Set();
  const root = app && (app._instance || (app._container._vnode && app._container._vnode.component));
  const stack = root ? [root] : [];
  while (stack.length) {
    const i = stack.pop();
    if (!i || seen.has(i)) continue;
    seen.add(i);
    out.push(i);
    const walk = (v) => {
      if (!v) return;
      if (v.component) stack.push(v.component);
      if (Array.isArray(v.children)) v.children.forEach(walk);
      if (v.dynamicChildren) v.dynamicChildren.forEach(walk);
      if (v.suspense) walk(v.suspense.activeBranch);
    };
    walk(i.subTree);
  }
  snapshot = out;
  return snapshot.filter(pred);
}
const visible = (i) => !!(i.subTree && i.subTree.el && i.subTree.el.offsetParent);
function control(cfg, value) {
  const all = findAll((i) => {
    const vc = i.props && i.props.viewConfig, n = i.type.__name || '';
    return vc && vc.id === cfg && i.props.idHeader && (n.startsWith('base-') || n === 'common-input') && n !== 'base-form-group';
  });
  if (value !== undefined) {
    const radio = all.find((i) => visible(i) && i.type.__name === 'base-radio-group'
      && (i.props.sourceData || []).some((o) => o.value === value));
    if (radio) return radio;
  }
  return all.find(visible) || null;
}
function optionLabels(o) {
  return [o.text, o.activeLabel, o.noActiveLabel].filter((x) => x != null).map((x) => String(x).trim());
}
function cartStore() { return app.config.globalProperties.$pinia._s.get('cartInfo').$state; }
const FNS = {
  loadState() {
    return {ready: document.readyState, app: !!appEl, vue: !!app,
      templates: findAll((i) => i.type.__name === 'template-render').length,
      scripts: document.scripts.length};
  },
  ready() { return !!app && findAll((i) => i.type.__name === 'template-render').length > 0; },
  version() { return [...document.scripts].map((s) => s.src).filter(Boolean); },
  removeOverlays(sel) { document.querySelectorAll(sel).forEach((e) => e.remove()); return true; },
  formState() {
    const r = findAll((i) => i.type.__name === 'template-render' && i.props.valueWatcher
      && Object.keys(i.props.valueWatcher).length)[0];
    return r ? plain(r.props.valueWatcher) : null;
  },
  describe(cfg) {
    const i = control(cfg);
    if (!i) return null;
    return { kind: i.type.__name, id: i.props.idHeader, options: plain(i.props.sourceData || []) };
  },
  radioStepper(cfg, value) {
    const i = control(cfg, value);
    if (!i || i.type.__name !== 'base-radio-group') return null;
    return { kind: i.type.__name, id: i.props.idHeader, options: plain(i.props.sourceData || []) };
  },
  clickOption(cfg, value) {
    const i = control(cfg, value);
    if (!i) return 'missing';
    const opts = plain(i.props.sourceData || []);
    const idx = opts.findIndex((o) => o.value === value);
    if (idx < 0) return 'no-option';
    const labels = optionLabels(opts[idx]);
    const el = i.subTree.el;
    if (i.type.__name === 'base-radio-group') {
      const btns = [...el.querySelectorAll('li button')];
      const b = btns.find((x) => labels.includes(x.innerText.trim())) || (btns.length === opts.length ? btns[idx] : null);
      if (!b) return 'no-button';
      b.click();
      return 'ok';
    }
    return 'not-a-radio';
  },
  // One click toward exactly the wanted boxes; the page re-renders between clicks (it also unticks boxes
  // by itself), so the caller asks again. Ticks come first: the page keeps at least one box ticked.
  setChecks(cfg, values) {
    const i = control(cfg);
    if (!i) return 'missing';
    const want = new Set(values.map(String));
    const boxes = [...i.subTree.el.querySelectorAll('label.tiny-checkbox')];
    if (!boxes.length) return 'no-boxes';
    const todo = (b) => want.has(b.querySelector('input').value) !== b.classList.contains('is-checked');
    const b = boxes.find((x) => todo(x) && want.has(x.querySelector('input').value)) || boxes.find(todo);
    if (!b) return 'ok';
    if (b.classList.contains('is-disabled')) return 'disabled';
    b.click();
    return 'clicked';
  },
  openSelect(cfg) {
    const i = control(cfg);
    if (!i) return 'missing';
    const s = i.subTree.el.querySelector('.tiny-select');
    if (!s) return 'no-select';
    s.click();
    return 'ok';
  },
  pickDropdown(labels) {
    const items = [...document.querySelectorAll('li.tiny-select-dropdown__item, .tvp-region__option-content-item')]
      .filter((li) => li.offsetParent && labels.includes(li.innerText.trim()));
    if (!items.length) return 'no-item';
    items[items.length - 1].click();
    return 'ok';
  },
  readBack(cfg) {
    let i = control(cfg);
    if (i && i.type.__name === 'base-radio-stepper') {
      const nested = findAll((c) => c.type.__name === 'base-radio-group' && visible(c)
        && c.props.viewConfig && c.props.viewConfig.id === cfg)[0];
      if (nested) i = nested;
    }
    if (!i) return null;
    const el = i.subTree.el;
    if (i.type.__name === 'base-radio-group') {
      const a = el.querySelector('li.active');
      return a ? a.innerText.trim() : null;
    }
    const inp = el.querySelector('input');
    return inp ? inp.value : null;
  },
  cartKeys() { return Object.keys(cartStore().cartListDataBase || {}); },
  cartItem(key) { const v = (cartStore().cartListDataBase || {})[key]; return v ? plain(v) : null; },
  cartSummary(key) {
    const v = (cartStore().cartListDataBase || {})[key];
    return v ? { amount: v.selectedProduct.amount, timeTag: v.selectedProduct.timeTag } : null;
  },
  tagCard(key) {
    const hit = findAll((i) => i.type.__name === 'collapse-card-item'
      && JSON.stringify(plain(i.props.sourceData || {})).includes(key))[0];
    if (!hit) return false;
    hit.subTree.el.setAttribute('data-autocalc-card', key);
    return true;
  },
  editState() {
    const ci = cartStore();
    const stored = ci.editInfo && ci.editInfo.originData ? plain(ci.editInfo.originData.rewriteValue) : null;
    const board = findAll((i) => i.type.__name === 'func-priceboard' && i.props.selectedInfo
      && i.props.selectedInfo.rewriteValue)[0];
    return { stored, current: board ? plain(board.props.selectedInfo.rewriteValue) : null,
             cartId: ci.editInfo && ci.editInfo.showData ? ci.editInfo.showData._cartId : null };
  },
};
`;

// Install the code once per document; globals are read again for each call so an initially absent
// Vue app and later component replacements are never cached across polls.
const BRIDGE = "__autocalc_page_bridge_v1__";
const INSTALL_REQUIRED = { __autocalc_install_required__: true };
export const INSTALL_SCRIPT = `() => { globalThis.${BRIDGE} = async ({fn, args}) => {${LIB}\nreturn await FNS[fn](...args); }; }`;
export const SCRIPT = `async (payload) => globalThis.${BRIDGE} ? await globalThis.${BRIDGE}(payload) : {__autocalc_install_required__: true}`;

/** The slice of a Playwright page the store needs; a test double answers `evaluate`. */
export interface Evaluating { evaluate(script: string, arg?: unknown): Promise<unknown> }

/** Call one named function of the page library. */
export async function js(page: Evaluating, fn: string, ...args: unknown[]): Promise<any> {
  const payload = { fn, args };
  const result = await page.evaluate(SCRIPT, payload);
  if (result && typeof result === "object" && (result as Record<string, unknown>).__autocalc_install_required__ === INSTALL_REQUIRED.__autocalc_install_required__) {
    await page.evaluate(INSTALL_SCRIPT);
    return page.evaluate(SCRIPT, payload);
  }
  return result;
}

// ---- pure normalizers ----

/** The calculator frontend version, from the `.../CBC-PortalCalculator/<version>/...` script URL. */
export function frontendVersion(scriptSrcs: string[]): string | undefined {
  for (const src of scriptSrcs) { const match = VERSION.exec(src ?? ""); if (match) return match[1]; }
  return undefined;
}

type Dict = Record<string, unknown>;
/** The saved-list card: the cart item's buyUrl, rewriteValue and selectedProduct. */
export function cardFromCartItem(item: Dict): Dict {
  return Object.fromEntries(CARD_KEYS.map(key => [key, item[key]]));
}

/** The one cart key that appeared after Add to List, or undefined. */
export function newCartKey(before: string[], after: string[]): string | undefined {
  const known = new Set(before), fresh = after.filter(key => !known.has(key));
  return fresh.length === 1 ? fresh[0] : undefined;
}

const empty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0) || (typeof value === "object" && value !== null && !Array.isArray(value) && Object.keys(value).length === 0);
const isDict = (value: unknown): value is Dict => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => value === true ? "True" : value === false ? "False" : String(value);
const sameList = (a: unknown[], b: unknown[]) => { const x = a.map(text).sort(), y = b.map(text).sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (isDict(a) && isDict(b)) { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => equal(a[key], b[key])); }
  return false;
}

/** Paths where `current` differs from `stored`, by the page's own rule after Edit:
 * every non-empty value of the stored copy must be present and equal in the current one. */
export function rewriteMismatches(stored: unknown, current: unknown, path = ""): string[] {
  if (!isDict(stored)) return equal(stored, current) ? [] : [path || "."];
  const out: string[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (empty(value)) continue;
    const sub = path ? `${path}.${key}` : key, other = isDict(current) ? current[key] : undefined;
    if (isDict(value)) { if (!isDict(other)) out.push(sub); else out.push(...rewriteMismatches(value, other, sub)); }
    else if (Array.isArray(value) && Array.isArray(other) ? !sameList(value, other) : !equal(value, other ?? null)) out.push(sub);
  }
  return out;
}
