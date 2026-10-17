"""Check a saved list's Edit prices on the calculator page itself (design D6).

For each card: open the share link anonymously, copy the list into the page's cart (View
Details), open the card's Edit view, let the page re-price it from the stored form state, and
Save it back to the cart, where the re-priced amount becomes readable. A card passes only when
the form's final state matches the stored one (the page's own rule) and the amounts are equal
to the cent. Per-card failures are reported, never raised.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from autocalc.client import Calculator
from autocalc.errors import PageEncodeFailed
from autocalc.page import store
from autocalc.page.driver import Driver
from autocalc.services.base import SHARE_URL

CARD_BUTTON = "[data-autocalc-card='{key}'] button"
WARNING_DIALOG = "[closeactionname=rewriteError_close]"


@dataclass(frozen=True)
class EditResult:
    index: int
    stored: Decimal
    edit: Decimal | None
    equal: bool
    reason: str | None = None
    warning: bool = False  # the page showed its "No data matched…" dialog (informational)


def detail_cards(detail: dict[str, Any]) -> list[dict[str, Any]]:
    cards = detail.get("cartListData") or []
    return json.loads(cards) if isinstance(cards, str) else cards


def _button(page: Any, key: str, label: str) -> Any:
    return page.locator(CARD_BUTTON.format(key=key), has_text=label).first


def _close_warning(page: Any) -> bool:
    """Close the page's "No data matched…" dialog if it is open; True if it was."""
    dialog = page.locator(WARNING_DIALOG)
    if not dialog.is_visible():
        return False
    try:
        page.locator(f"{WARNING_DIALOG} button.tiny-dialog-box__headerbtn").first.click(timeout=3000)
    except Exception:
        page.keyboard.press("Escape")
    store.js(page, "removeOverlays", ".v-modal")  # the dialog leaves its mask behind, blocking clicks
    return True


def _click(driver: Driver, key: str, label: str) -> tuple[bool, bool]:
    """Click a card's button, clearing masks and the warning dialog between tries until the
    deadline. Returns (clicked, warning seen)."""
    page, seen = driver.page, False

    def attempt() -> bool:
        nonlocal seen
        seen |= _close_warning(page)
        store.js(page, "removeOverlays", store.OVERLAYS)
        try:
            _button(page, key, label).click(timeout=2000)
            return True
        except Exception:
            return False

    return bool(driver.wait(attempt)), seen


def check_card(driver: Driver, index: int, card: dict[str, Any]) -> EditResult:
    """Edit one card already in the page's cart and compare the re-priced amount with the stored one."""
    page = driver.page
    stored = store.cents(card["selectedProduct"]["amount"])
    key = card["selectedProduct"].get("_cartId")
    seen_warning = False

    def failed(reason: str, editing: bool = True) -> EditResult:
        if editing:  # leave edit mode so the next card's Edit button works
            try:
                _close_warning(page)
                _button(page, key, "Cancel").click(timeout=3000)
            except Exception:
                pass
        return EditResult(index, stored, None, False, reason, seen_warning)

    before = store.js(page, "cartSummary", key) if key else None
    if not before or not store.js(page, "tagCard", key):
        return failed("the card is not in the page's price list after View Details", editing=False)
    driver.mark()
    clicked, seen_warning = _click(driver, key, "Edit")
    if not clicked:
        return failed("the Edit button did not respond", editing=False)
    if not driver.wait(lambda: (store.js(page, "editState") or {}).get("cartId") == key):
        return failed("the Edit view did not open")

    # The page refills the form in stages (region, catalog, each control). Wait until it holds
    # the stored form state, by the page's own comparison rule, before trusting the price.
    def converged() -> bool:
        nonlocal seen_warning
        seen_warning |= bool(page.locator(WARNING_DIALOG).is_visible())
        current = (store.js(page, "editState") or {}).get("current")
        return current is not None and not store.rewrite_mismatches(card["rewriteValue"], current)

    if not driver.wait(converged):
        current = (store.js(page, "editState") or {}).get("current")
        mismatches = store.rewrite_mismatches(card["rewriteValue"], current)
        return failed("the form state differs after Edit: " + ", ".join(mismatches or ["no form state"]))
    driver.mark()  # the refill passes through states the page cannot price; only the final one counts
    try:
        driver.settle()
    except PageEncodeFailed as exc:
        return failed(f"the Edit view did not re-price: {exc.message}")
    # The dialog can open at any time during the refill and blocks clicks; _click closes it.
    clicked, warned = _click(driver, key, "Save")
    seen_warning |= warned
    if not clicked:
        return failed("the Save button did not respond")
    after = driver.wait(lambda: (s := store.js(page, "cartSummary", key)) and s["timeTag"] != before["timeTag"] and s)
    if not after:
        return failed("the re-priced card was not saved back to the price list")
    item = store.js(page, "cartItem", key) or {}
    if any(not p.get("inquiryResult") for p in (item.get("selectedProduct") or {}).get("productAllInfos", [None])):
        return EditResult(index, stored, None, False, "the re-priced card has unpriced products", seen_warning)
    edit = store.cents(after["amount"])
    if edit != stored:
        return EditResult(index, stored, edit, False, f"Edit re-prices to {edit}, stored {stored}", seen_warning)
    return EditResult(index, stored, edit, True, None, seen_warning)


def edit_check(list_id: str, calc: Calculator | None = None, service: str = "ecs") -> list[EditResult]:
    """One result per card of the saved list, in list order. Raises only if the list cannot be read."""
    from autocalc.page.browser import page_context
    from autocalc.share import share_detail

    cards = detail_cards(share_detail(calc or Calculator(), list_id))
    with page_context(service) as ctx:
        page = ctx.new_page()
        driver = Driver(page, service)
        try:
            driver.open(SHARE_URL.format(id=list_id, currency="USD"))
            driver.settle()
            store.js(page, "removeOverlays", store.OVERLAYS)
            page.get_by_role("button", name="View Details").click(timeout=driver.timeout * 1000)
        except Exception as exc:
            reason = exc.message if isinstance(exc, PageEncodeFailed) else "the shared list did not open"
            return [EditResult(i, store.cents(c["selectedProduct"]["amount"]), None, False, reason)
                    for i, c in enumerate(cards)]
        return [check_card(driver, i, card) for i, card in enumerate(cards)]
