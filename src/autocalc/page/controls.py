"""List the visible controls of a service's calculator page, to write or check a form recipe."""

from __future__ import annotations

from typing import Any

from autocalc.page import store
from autocalc.page.browser import page_context
from autocalc.page.driver import Driver
from autocalc.page.replay import PAGE_SERVICE

_LIST = store._LIB + """
return findAll((i) => {
  const vc = i.props && i.props.viewConfig, n = i.type.__name || '';
  return vc && vc.id && i.props.idHeader && (n.startsWith('base-') || n === 'common-input')
    && n !== 'base-form-group' && visible(i);
}).map((i) => ({id: i.props.viewConfig.id, kind: i.type.__name,
                options: plain(i.props.sourceData || []).map((o) => o.value)}));
"""


def page_controls(service: str) -> list[dict[str, Any]]:
    """Every visible control: ``{id, kind, options}``. Anonymous; saves nothing."""
    with page_context(service) as ctx:
        driver = Driver(ctx.new_page(), PAGE_SERVICE.get(service, service))
        driver.open()
        driver.page.wait_for_timeout(1500)  # controls mount just after the form does
        return driver.page.evaluate("() => {" + _LIST + "}")
