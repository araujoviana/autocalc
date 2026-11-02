"""List the visible controls of a service's calculator page, to write or check a form recipe."""

from __future__ import annotations

from typing import Any

from autocalc.page import store
from autocalc.page.browser import page_context
from autocalc.page.driver import Driver
from autocalc.page.replay import PAGE_SERVICE

_LIST = store._LIB + """
const unit = (p) => (p && (p.measureName || p.measurePluralName)) || null;
const ranges = (vc) => (vc.steppers || []).flatMap((st) => (st.prefixs || []).map((p) => ({
  min: p.min, max: p.max, step: p.step == null ? 1 : p.step, default: p.defaultValue, unit: unit(p),
  when: ((st.rules || [])[0] || {}).resourceSpecCode || null})));
return findAll((i) => {
  const vc = i.props && i.props.viewConfig, n = i.type.__name || '';
  return vc && vc.id && i.props.idHeader && (n.startsWith('base-') || n === 'common-input')
    && n !== 'base-form-group' && visible(i);
}).map((i) => {
  const vc = i.props.viewConfig, r = i.subTree.el.getBoundingClientRect();
  return {id: vc.id, kind: i.type.__name, title: vc.title || null, value_type: vc.valueType || null,
          option_key: vc.optionKey || null, default: plain(vc.defaultValue == null ? null : vc.defaultValue),
          ranges: plain(ranges(vc.steppers ? vc : {steppers: [{prefixs: vc.prefixs}]})),
          y: Math.round(r.top + window.scrollY), x: Math.round(r.left),
          options: (Array.isArray(i.props.sourceData) ? plain(i.props.sourceData) : []).map((o) => o.value)};
});
"""


def page_controls(service: str) -> list[dict[str, Any]]:
    """Every visible control: ``{id, kind, title, ranges, options, ...}``. Anonymous; saves nothing."""
    with page_context(service) as ctx:
        driver = Driver(ctx.new_page(), PAGE_SERVICE.get(service, service))
        driver.open()
        driver.page.wait_for_timeout(1500)  # controls mount just after the form does
        return driver.page.evaluate("() => {" + _LIST + "}")
