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
function findAll(pred) {
  const out = [], seen = new Set();
  const root = app && (app._instance || (app._container._vnode && app._container._vnode.component));
  const stack = root ? [root] : [];
  while (stack.length) {
    const i = stack.pop();
    if (!i || seen.has(i)) continue;
    seen.add(i);
    if (pred(i)) out.push(i);
    const walk = (v) => {
      if (!v) return;
      if (v.component) stack.push(v.component);
      if (Array.isArray(v.children)) v.children.forEach(walk);
      if (v.dynamicChildren) v.dynamicChildren.forEach(walk);
      if (v.suspense) walk(v.suspense.activeBranch);
    };
    walk(i.subTree);
  }
  return out;
}
const visible = (i) => !!(i.subTree && i.subTree.el && i.subTree.el.offsetParent);
function control(cfg) {
  const all = findAll((i) => {
    const vc = i.props && i.props.viewConfig, n = i.type.__name || '';
    return vc && vc.id === cfg && i.props.idHeader && n.startsWith('base-') && n !== 'base-form-group';
  });
  return all.find(visible) || null;
}
function optionLabels(o) {
  return [o.text, o.activeLabel, o.noActiveLabel].filter((x) => x != null).map((x) => String(x).trim());
}
function cartStore() { return app.config.globalProperties.$pinia._s.get('cartInfo').$state; }
const FNS = {
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
  clickOption(cfg, value) {
    const i = control(cfg);
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
    const i = control(cfg);
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

SCRIPT = "async ({fn, args}) => {" + _LIB + "\nreturn await FNS[fn](...args);\n}"


def js(page: Any, fn: str, *args: Any) -> Any:
    """Call one named function of the page library."""
    return page.evaluate(SCRIPT, {"fn": fn, "args": list(args)})


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
        elif value != other:
            out.append(sub)
    return out


def cents(amount: Any) -> Decimal:
    """An amount rounded to cents, half up, as the calculator displays it."""
    return Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
