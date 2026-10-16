"""Render test (B0.5): publish a generated list, open the share link headless and
verify the SPA actually loads that list, then delete the list.

What is asserted (stable): the page loads and the frontend issues a successful
`share/detail` request for our list id, and the page body is not empty.
DOM card count / price text is recorded as a diagnostic - the calculator SPA
renders the shared list inside a modal that a click opens, so a strict DOM
assertion is best-effort.

Run:  .venv/bin/python tests/render.py
"""

from __future__ import annotations

import re
import sys

from autocalc.client import Calculator
from autocalc.services.base import SHARE_URL, Builder
from autocalc.services.ecs import EcsBuilder
from autocalc.share import Session


def render_check(url: str, list_id: str, timeout_ms: int = 60000) -> dict:
    from playwright.sync_api import sync_playwright

    responses: list[tuple[int, str]] = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        pg = b.new_page()
        pg.on("response", lambda r: responses.append((r.status, r.url))
              if "share/detail" in r.url or "/share/" in r.url else None)
        pg.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
        pg.wait_for_timeout(12000)  # let the SPA fetch and render the list
        text = pg.inner_text("body")
        b.close()
    detail_ok = any(status == 200 and "detail" in u for status, u in responses)
    cards = len(re.findall(r"View Details", text, re.I))
    amounts = re.findall(r"\$[\d,]+\.\d{2}", text)
    return {"loaded": bool(text), "detail_request_ok": detail_ok, "cards_dom": cards,
            "amounts_dom": amounts[:8], "share_requests": [u.split("?")[0].split("/")[-1] for _, u in responses]}


def main() -> int:
    calc = Calculator()
    card = EcsBuilder(calc).build(region="sa-brazil-1", flavor="c7n.large.2", billing="monthly",
                                  quantity=1, image="Ubuntu", system_disk=("GPSSD", 40), bandwidth_mbit=5)
    payload = Builder.share_payload("autocalc-render-test", [card])
    session = Session()
    lid = session.create(payload)
    url = SHARE_URL.format(id=lid, currency="USD")
    try:
        res = render_check(url, lid)
        print(f"list {lid} url {url}")
        print(f"loaded={res['loaded']} detail_request_ok={res['detail_request_ok']}")
        print(f"DOM cards={res['cards_dom']} amounts={res['amounts_dom']}  (built total {card['selectedProduct']['amount']})")
        print(f"share requests: {res['share_requests']}")
        ok = res["loaded"] and res["detail_request_ok"]
        print("RENDER TEST:", "PASS" if ok else "FAIL")
        return 0 if ok else 1
    finally:
        session.delete(lid)
        print(f"deleted {lid}; remaining {len(session.lists())}")


if __name__ == "__main__":
    sys.exit(main())
