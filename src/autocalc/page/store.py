"""Reads from the calculator page's own state, and the DOM actions the driver needs.

All JavaScript lives in ``_LIB`` and is called by name through :func:`js`, so each page access
is one auditable function and tests can fake the page by answering on ``fn``. How the page is
reached (vnode walk from ``#app``, ``template-render``'s ``valueWatcher``, the ``cartInfo``
store) is described in ``docs/explanation/huawei/page-encoder.md``.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

CARD_KEYS = ("buyUrl", "rewriteValue", "selectedProduct")
OVERLAYS = ".guide-dialog, .v-modal, .privacy-popup"
_VERSION_RE = re.compile(r"CBC-PortalCalculator/([0-9.]+)/")

_LIB = r"""
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
"""

# Install code once per document; globals are read again for each call so an initially
# absent Vue app and later component replacements are never cached across polls.
_BRIDGE = "__autocalc_page_bridge_v1__"
INSTALL_REQUIRED = {"__autocalc_install_required__": True}
INSTALL_SCRIPT = "() => { globalThis." + _BRIDGE + " = async ({fn, args}) => {" + _LIB + "\nreturn await FNS[fn](...args); }; }"
SCRIPT = "async (payload) => globalThis." + _BRIDGE + " ? await globalThis." + _BRIDGE + "(payload) : {__autocalc_install_required__: true}"


def js(page: Any, fn: str, *args: Any) -> Any:
    """Call one named function of the page library."""
    payload = {"fn": fn, "args": list(args)}
    result = page.evaluate(SCRIPT, payload)
    if result == INSTALL_REQUIRED:
        page.evaluate(INSTALL_SCRIPT)
        return page.evaluate(SCRIPT, payload)
    return result


# ---- pure normalizers --------------------------------------------------------------


def frontend_version(script_srcs: list[str]) -> str | None:
    """The calculator frontend version, from the ``…/CBC-PortalCalculator/<version>/…`` script URL."""
    for src in script_srcs:
        if m := _VERSION_RE.search(src or ""):
            return m.group(1)
    return None


def card_from_cart_item(item: dict[str, Any]) -> dict[str, Any]:
    """The saved-list card: the cart item's ``buyUrl``, ``rewriteValue`` and ``selectedProduct``."""
    return {k: item[k] for k in CARD_KEYS}


def new_cart_key(before: list[str], after: list[str]) -> str | None:
    """The one cart key that appeared after Add to List, or ``None``."""
    new = [k for k in after if k not in set(before)]
    return new[0] if len(new) == 1 else None


def _empty(v: Any) -> bool:
    return v is None or v == "" or (isinstance(v, (dict, list)) and not v)


def rewrite_mismatches(stored: Any, current: Any, path: str = "") -> list[str]:
    """Paths where ``current`` differs from ``stored``, by the page's own rule after Edit:
    every non-empty value of the stored copy must be present and equal in the current one."""
    out: list[str] = []
    if not isinstance(stored, dict):
        return [] if stored == current else [path or "."]
    for key, value in stored.items():
        if _empty(value):
            continue
        sub = f"{path}.{key}" if path else key
        other = current.get(key) if isinstance(current, dict) else None
        if isinstance(value, dict):
            if not isinstance(other, dict):
                out.append(sub)
            else:
                out.extend(rewrite_mismatches(value, other, sub))
        elif (sorted(map(str, value)) != sorted(map(str, other)) if isinstance(value, list) and isinstance(other, list) else value != other):
            out.append(sub)
    return out


def cents(amount: Any) -> Decimal:
    """An amount rounded to cents, half up, as the calculator displays it."""
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
