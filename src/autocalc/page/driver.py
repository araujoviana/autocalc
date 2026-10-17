"""Fill the calculator form from a recipe and capture the card the page builds (design D3-D5).

Values are set through the DOM (clicks and typing on the element whose component carries the
step's config id), never by writing the page's state, so the page's own per-service functions
run exactly as for a person. Every step is read back; any surprise raises ``PAGE_ENCODE_FAILED``.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from autocalc.errors import PageEncodeFailed
from autocalc.page import store

CALCULATOR_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html#/{service}"
RATING_PATH = "/ratingservice/v2/inquiry/resource"
ADD_TO_LIST = "#rshema_func_priceboard_addToList"

Kind = Literal["radio", "select", "region", "stepper", "add"]


@dataclass(frozen=True)
class Step:
    """Set one form control. ``component_id`` is the control's config id (``viewConfig.id``),
    except for ``add``, where it is the addible's id and ``value`` is unused."""

    component_id: str
    kind: Kind
    value: Any = None


class Driver:
    def __init__(self, page: Any, service: str, *, timeout: float = 20.0, quiet: float = 1.5,
                 poll_ms: int = 250, clock: Callable[[], float] = time.monotonic):
        self.page, self.service = page, service
        self.timeout, self.quiet, self.poll_ms, self.clock = timeout, quiet, poll_ms, clock
        self.frontend_version: str | None = None
        self._inflight = 0
        self._last_activity = clock()
        # Rating requests are tagged with the step that was current when they were sent: the form
        # passes through states the page cannot price (e.g. RI before the flavor is chosen), and
        # only a failure of the final state counts.
        self._gen = 0
        self._sent: dict[int, tuple[Any, int]] = {}  # id(request) -> (request, step)
        self._responses: list[tuple[Any, int]] = []
        self._failed_gens: set[int] = set()
        page.on("request", self._on_request)
        page.on("response", self._on_response)

    # ---- network watch ----------------------------------------------------------

    def _on_request(self, request: Any) -> None:
        url = request.url
        # The page also reports failures with an ``inquiryfailed`` request, but that is sent after
        # the failed response and so cannot be tied to the form state; the response itself is.
        if RATING_PATH in url:
            self._inflight += 1
            self._last_activity = self.clock()
            self._sent[id(request)] = (request, self._gen)

    def _on_response(self, response: Any) -> None:
        if RATING_PATH in response.url:
            self._inflight = max(0, self._inflight - 1)
            self._last_activity = self.clock()
            _req, gen = self._sent.pop(id(getattr(response, "request", None)), (None, self._gen))
            self._responses.append((response, gen))

    def _check_inquiries(self) -> None:
        responses, self._responses = self._responses, []
        for r, gen in responses:
            body = None
            try:
                body = r.json()
            except Exception:
                pass
            if r.status != 200 or (isinstance(body, dict) and body.get("exceptionId")):
                self._failed_gens.add(gen)
        if self._gen in self._failed_gens:
            raise self._fail("The page reported a failed price inquiry.", step="inquiry")

    # ---- helpers ----------------------------------------------------------------

    def _fail(self, message: str, *, step: str | None = None, field: str | None = None) -> PageEncodeFailed:
        return PageEncodeFailed(message, service=self.service, step=step, field=field,
                                frontend_version=self.frontend_version)

    def wait(self, probe: Callable[[], Any], timeout: float | None = None) -> Any:
        """Poll ``probe`` until it returns something truthy; ``None`` on timeout."""
        deadline = self.clock() + (self.timeout if timeout is None else timeout)
        while True:
            if value := probe():
                return value
            if self.clock() >= deadline:
                return None
            self.page.wait_for_timeout(self.poll_ms)

    def _touch(self) -> None:
        self._last_activity = self.clock()

    # ---- page lifecycle ---------------------------------------------------------

    def open(self, url: str | None = None) -> None:
        """Load the service's calculator page and wait until its form is mounted."""
        try:
            self.page.goto(url or CALCULATOR_URL.format(service=self.service), wait_until="domcontentloaded",
                           timeout=int(self.timeout * 3000))
        except Exception as exc:
            raise self._fail("The calculator page did not load.", step="open") from exc
        if not self.wait(lambda: self._safe_js("ready"), timeout=self.timeout * 3):
            raise self._fail("The calculator form did not appear.", step="open")
        self.frontend_version = store.frontend_version(self._safe_js("version") or [])
        store.js(self.page, "removeOverlays", store.OVERLAYS)
        self._touch()

    def _safe_js(self, fn: str, *args: Any) -> Any:
        try:
            return store.js(self.page, fn, *args)
        except Exception:
            return None

    # ---- steps ------------------------------------------------------------------

    def run(self, steps: list[Step]) -> None:
        for step in steps:
            self.apply(step)

    def mark(self) -> None:
        """Start a new phase: rating failures from before this point no longer count."""
        self._gen += 1
        self._touch()

    def apply(self, step: Step) -> None:
        self._gen += 1
        if step.kind == "add":
            self._add(step)
        elif step.kind == "stepper":
            self._stepper(step)
        else:
            self._choose(step)
        self._touch()

    def _option(self, step: Step) -> tuple[dict[str, Any], dict[str, Any]]:
        """The control and the requested option, waiting for both to appear (choices narrow later ones)."""
        def probe():
            ctl = store.js(self.page, "describe", step.component_id)
            if not ctl:
                return None
            opt = next((o for o in ctl["options"] if o.get("value") == step.value), None)
            return (ctl, opt) if opt else None

        found = self.wait(probe)
        if not found:
            ctl = store.js(self.page, "describe", step.component_id)
            if not ctl:
                raise self._fail(f"The form has no control {step.component_id}.", field=step.component_id)
            offered = [o.get("value") for o in ctl["options"]]
            raise self._fail(f"{step.value!r} is not offered for {step.component_id}; the form offers {offered}.",
                             field=step.component_id)
        return found

    @staticmethod
    def _labels(option: dict[str, Any]) -> list[str]:
        return [str(option[k]).strip() for k in ("text", "activeLabel", "noActiveLabel") if option.get(k) is not None]

    def _choose(self, step: Step) -> None:
        _ctl, option = self._option(step)
        labels = self._labels(option)
        if step.kind == "radio":
            result = store.js(self.page, "clickOption", step.component_id, step.value)
        else:
            result = store.js(self.page, "openSelect", step.component_id)
            if result == "ok":
                result = self.wait(lambda: store.js(self.page, "pickDropdown", labels) == "ok" and "ok", timeout=5)
        if result != "ok":
            raise self._fail(f"Could not set {step.component_id} to {step.value!r} ({result}).", field=step.component_id)
        if not self.wait(lambda: store.js(self.page, "readBack", step.component_id) in labels):
            shown = store.js(self.page, "readBack", step.component_id)
            raise self._fail(f"{step.component_id} shows {shown!r} after choosing {step.value!r}.",
                             field=step.component_id)

    def _stepper(self, step: Step) -> None:
        def probe():
            return store.js(self.page, "describe", step.component_id)

        ctl = self.wait(probe)
        if not ctl:
            raise self._fail(f"The form has no control {step.component_id}.", field=step.component_id)
        box = self.page.locator(f"[id='{ctl['id']}'] input")
        try:
            box.fill(_number(step.value))
            box.press("Enter")
        except Exception as exc:
            raise self._fail(f"Could not type into {step.component_id}.", field=step.component_id) from exc

        def same():
            shown = store.js(self.page, "readBack", step.component_id)
            try:
                return float(str(shown).replace(",", "")) == float(step.value)
            except (TypeError, ValueError):
                return False

        if not self.wait(same):
            shown = store.js(self.page, "readBack", step.component_id)
            raise self._fail(f"{step.component_id} shows {shown!r} after typing {step.value!r}.",
                             field=step.component_id)

    def _add(self, step: Step) -> None:
        prefix = f"{step.component_id}_|addible0|_"

        def rows() -> int:
            state = store.js(self.page, "formState") or {}
            group = (state.get("template_RENDER") or {}).get("value", {}).get(step.component_id) or {}
            return sum(1 for k in group if k.startswith(prefix))

        before = rows()
        try:  # a pointer click: the add button ignores a DOM click()
            self.page.click(f"[id='{step.component_id}'] .common-addible-addDisk", timeout=self.timeout * 1000)
        except Exception as exc:
            raise self._fail(f"The form has no add button for {step.component_id}.", field=step.component_id) from exc
        if not self.wait(lambda: rows() > before):
            raise self._fail(f"No new row appeared in {step.component_id}.", field=step.component_id)

    # ---- capture ----------------------------------------------------------------

    def settle(self) -> None:
        """Wait until no rating request is in flight and none has finished for ``quiet`` seconds."""
        def quiet():
            self._check_inquiries()
            return self._inflight == 0 and self.clock() - self._last_activity >= self.quiet

        if not self.wait(quiet):
            raise self._fail("The price did not settle in time.", step="price")
        self._check_inquiries()

    def capture(self) -> dict[str, Any]:
        """Settle, click Add to List and return the new cart item's card."""
        self.settle()
        store.js(self.page, "removeOverlays", store.OVERLAYS)
        before = store.js(self.page, "cartKeys")
        try:
            self.page.click(ADD_TO_LIST)
        except Exception as exc:
            raise self._fail("Could not click Add to List.", step="add_to_list") from exc
        key = self.wait(lambda: store.new_cart_key(before, store.js(self.page, "cartKeys")))
        if not key:
            raise self._fail("No card appeared in the price list after Add to List.", step="add_to_list")
        item = store.js(self.page, "cartItem", key)
        products = item["selectedProduct"]["productAllInfos"]
        if any(not p.get("inquiryResult") for p in products):
            raise self._fail("The card has unpriced products.", step="inquiry")
        return store.card_from_cart_item(item)


def _number(value: Any) -> str:
    f = float(value)
    return str(int(f)) if f.is_integer() else str(f)
