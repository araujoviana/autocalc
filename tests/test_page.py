"""Offline tests for the page encoder (autocalc.page) - no network, no browser."""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest

from autocalc import auth
from autocalc.errors import CalculatorError, PageEncodeFailed, ValidationError
from autocalc.page import browser, store
from autocalc.page.driver import Driver, Step
from autocalc.page.ecs import EcsTokens, ecs_steps
from autocalc.page.edit_check import CARD_BUTTON, WARNING_DIALOG, check_card

FIXTURES = Path(__file__).parent / "fixtures" / "page"


def test_page_encode_failed_carries_step_field_and_version():
    exc = PageEncodeFailed("Flavor not offered.", service="ecs", field="calculator_ecs_radio_generation",
                           frontend_version="11.4.201")
    assert isinstance(exc, CalculatorError)
    assert exc.code == "PAGE_ENCODE_FAILED"
    assert exc.details == {"service": "ecs", "field": "calculator_ecs_radio_generation",
                           "frontend_version": "11.4.201"}
    assert exc.hint and "AUTOCALC_PAGE_HEADED=1" in exc.hint
    assert exc.as_dict()["error"] == "PAGE_ENCODE_FAILED"


def test_page_encode_failed_step_only():
    exc = PageEncodeFailed("Price inquiry failed.", service="ecs", step="inquiry")
    assert exc.details == {"service": "ecs", "step": "inquiry"}


# ---- 2.2 browser context -------------------------------------------------------

class FakeBrowser:
    def __init__(self, log):
        self.log = log

    def new_context(self, **kw):
        ctx = SimpleNamespace(kw=kw, closed=False)
        ctx.close = lambda: setattr(ctx, "closed", True)
        self.log.append(ctx)
        return ctx

    def close(self):
        self.log.append("browser-closed")


def fake_playwright(launch):
    class P:
        chromium = SimpleNamespace(launch=launch)

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            return False

    return P


@pytest.fixture
def isolated_dirs(tmp_path, monkeypatch):
    monkeypatch.setenv("AUTOCALC_CONFIG", str(tmp_path / "config"))
    monkeypatch.setenv("AUTOCALC_DATA", str(tmp_path / "data"))
    monkeypatch.delenv("AUTOCALC_PAGE_HEADED", raising=False)
    return tmp_path


def test_page_context_is_fresh_and_never_touches_the_profile(isolated_dirs):
    log, launches = [], []

    def launch(**kw):
        launches.append(kw)
        return FakeBrowser(log)

    for _ in range(2):
        with browser.page_context("ecs", playwright=fake_playwright(launch)) as ctx:
            assert ctx.kw["locale"] == "en-US"
    contexts = [x for x in log if x != "browser-closed"]
    assert len(contexts) == 2 and contexts[0] is not contexts[1]
    assert all(c.closed for c in contexts) and log.count("browser-closed") == 2
    assert all(kw["headless"] for kw in launches)
    assert "user_data_dir" not in launches[0]
    assert not auth.profile_dir().exists() and not (isolated_dirs / "data").exists()


def test_page_context_headed_env(isolated_dirs, monkeypatch):
    monkeypatch.setenv("AUTOCALC_PAGE_HEADED", "1")
    launches = []

    def launch(**kw):
        launches.append(kw)
        return FakeBrowser([])

    with browser.page_context("ecs", playwright=fake_playwright(launch)):
        pass
    assert launches[0]["headless"] is False


def test_page_context_launch_failure_is_mapped(isolated_dirs):
    def launch(**_kw):
        raise RuntimeError("RAW PLAYWRIGHT TEXT: executable doesn't exist")

    with pytest.raises(PageEncodeFailed) as ei:
        with browser.page_context("ecs", playwright=fake_playwright(launch)):
            pass
    assert ei.value.details["step"] == "browser"
    assert "RAW PLAYWRIGHT TEXT" not in str(ei.value)


# ---- 3.1 store normalizers -----------------------------------------------------


@pytest.fixture(scope="module")
def cart_snapshot():
    return json.loads((FIXTURES / "cart_monthly.json").read_text(encoding="utf-8"))["cartListDataBase"]


def test_card_from_cart_item_keeps_the_saved_card_keys(cart_snapshot):
    item = next(iter(cart_snapshot.values()))
    card = store.card_from_cart_item(item)
    assert set(card) == {"buyUrl", "rewriteValue", "selectedProduct"}
    sp = card["selectedProduct"]
    assert sp["chargeModeName"] == "MONTHLY" and sp["amount"] == 132.22
    assert sum(p["inquiryResult"]["amount"] for p in sp["productAllInfos"]) == pytest.approx(132.22)
    evs = card["rewriteValue"]["template_RENDER"]["calculator_evs_stepper"]
    assert sorted(evs) == ["calculator_evs_stepper_main", "calculator_evs_stepper_|addible0|_0",
                           "calculator_evs_stepper_|addible0|_1"]


def test_new_cart_key():
    assert store.new_cart_key(["a"], ["a", "b"]) == "b"
    assert store.new_cart_key(["a"], ["a"]) is None
    assert store.new_cart_key([], ["a", "b"]) is None  # ambiguous: never guess


def test_frontend_version():
    srcs = ["https://example.com/x.js", "https://portal.hc-cdn.com/CBC-PortalCalculator/11.4.201/framework.js"]
    assert store.frontend_version(srcs) == "11.4.201"
    assert store.frontend_version(["https://example.com/x.js"]) is None


def test_rewrite_mismatches_follows_the_page_rule(cart_snapshot):
    stored = next(iter(cart_snapshot.values()))["rewriteValue"]
    assert store.rewrite_mismatches(stored, json.loads(json.dumps(stored))) == []
    dropped = json.loads(json.dumps(stored))
    del dropped["template_RENDER"]["calculator_evs_stepper"]["calculator_evs_stepper_|addible0|_1"]
    assert store.rewrite_mismatches(stored, dropped) == [
        "template_RENDER.calculator_evs_stepper.calculator_evs_stepper_|addible0|_1"]
    resized = json.loads(json.dumps(stored))
    resized["global_PERIODTIME"]["UNSET_PeriodTime"]["measureId"] = 19
    assert store.rewrite_mismatches(stored, resized) == ["global_PERIODTIME.UNSET_PeriodTime.measureId"]
    # extra keys in the current form and empty stored values do not count, as on the page
    extra = json.loads(json.dumps(stored)) | {"global_FEEINSTALLMODE": {"feeInstallMode": None}}
    assert store.rewrite_mismatches({**stored, "x": None, "y": {}}, extra) == []


@pytest.mark.parametrize("raw,expected", [(132.22, "132.22"), (213.9484, "213.95"), (2205.5808, "2205.58"),
                                          (0.005, "0.01"), (9, "9.00")])
def test_cents(raw, expected):
    assert store.cents(raw) == Decimal(expected)


# ---- 3.2 / 3.3 driver ----------------------------------------------------------


class FakeClock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


class FakeLocator:
    def __init__(self, page, selector, has_text=None):
        self.page, self.selector, self.has_text = page, selector, has_text

    def nth(self, _i):
        return self

    @property
    def first(self):
        return self.nth(0)

    def click(self, **_kw):
        self.page.click(self.selector, has_text=self.has_text)

    def is_visible(self):
        return bool(self.page.fns.get("_visible", {}).get(self.selector))

    def fill(self, text):
        self.page.typed[self.selector] = text

    def press(self, key):
        self.page.pressed.append((self.selector, key))

    def blur(self):
        pass


class FakePage:
    """Answers the page library by function name; ``wait_for_timeout`` advances the fake clock."""

    def __init__(self, clock, **fns):
        self.clock, self.fns = clock, fns
        self.handlers: dict[str, list] = {}
        self.typed: dict[str, str] = {}
        self.pressed: list = []
        self.clicked: list = []
        self.calls: list = []

    def on(self, event, cb):
        self.handlers.setdefault(event, []).append(cb)

    def emit(self, event, obj):
        for cb in self.handlers.get(event, []):
            cb(obj)

    def evaluate(self, script, arg):
        assert script == store.SCRIPT
        self.calls.append((arg["fn"], *arg["args"]))
        fn = self.fns.get(arg["fn"])
        return fn(*arg["args"]) if callable(fn) else fn

    def wait_for_timeout(self, ms):
        self.clock.now += ms / 1000

    def locator(self, selector, has_text=None):
        return FakeLocator(self, selector, has_text)

    def click(self, selector, has_text=None, **_kw):
        target = selector if has_text is None else f"{selector}:{has_text}"
        self.clicked.append(target)
        if cb := self.fns.get("_on_click"):
            cb(target)

    @property
    def keyboard(self):
        return SimpleNamespace(press=lambda key: self.pressed.append(("keyboard", key)))


RADIO = {"kind": "base-radio-group", "id": "calculator_ecs_radio_2",
         "options": [{"value": "aC8", "text": "aC8"}, {"value": "C7n", "text": "C7n"}]}


def _driver(page, clock):
    return Driver(page, "ecs", timeout=5, quiet=1.5, clock=clock)


def test_radio_step_clicks_and_reads_back():
    clock = FakeClock()
    shown = {"v": "aC8"}

    def click(cfg, value):
        shown["v"] = value
        return "ok"

    page = FakePage(clock, describe=RADIO, clickOption=click, readBack=lambda cfg: shown["v"])
    _driver(page, clock).apply(Step("calculator_ecs_radio_generation", "radio", "C7n"))
    assert ("clickOption", "calculator_ecs_radio_generation", "C7n") in page.calls


def test_read_back_mismatch_names_the_field():
    clock = FakeClock()
    page = FakePage(clock, describe=RADIO, clickOption="ok", readBack="aC8")
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_ecs_radio_generation", "radio", "C7n"))
    assert ei.value.details["field"] == "calculator_ecs_radio_generation"
    assert "shows 'aC8'" in ei.value.message


def test_missing_option_names_the_field_and_lists_the_offer():
    clock = FakeClock()
    page = FakePage(clock, describe=RADIO)
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_ecs_radio_generation", "radio", "X9"))
    assert ei.value.details["field"] == "calculator_ecs_radio_generation"
    assert "'aC8', 'C7n'" in ei.value.message and clock.now >= 5  # it waited for the option first


def test_missing_control_names_the_field():
    clock = FakeClock()
    page = FakePage(clock, describe=None)
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_ecs_RIRadio_RITime", "radio", "nodeData.1_3"))
    assert ei.value.details["field"] == "calculator_ecs_RIRadio_RITime"


def test_stepper_types_and_reads_back():
    clock = FakeClock()
    page = FakePage(clock, describe={"kind": "base-stepper", "id": "calculator_evs_stepper_1_1", "options": []},
                    readBack=lambda cfg: page.typed.get("[id='calculator_evs_stepper_1_1'] input"))
    _driver(page, clock).apply(Step("calculator_evs_stepper_|addible0|_0_Stepper_0", "stepper", 50))
    assert page.typed == {"[id='calculator_evs_stepper_1_1'] input": "50"}
    assert page.pressed == [("[id='calculator_evs_stepper_1_1'] input", "Enter")]


def test_stepper_clamped_value_fails():
    clock = FakeClock()
    page = FakePage(clock, describe={"kind": "base-stepper", "id": "calculator_evs_stepper_0_1", "options": []},
                    readBack="40")
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_evs_stepper_main_Stepper_0", "stepper", 20))
    assert ei.value.details["field"] == "calculator_evs_stepper_main_Stepper_0"


def test_add_step_clicks_and_waits_for_a_new_row():
    clock = FakeClock()
    rows = {"calculator_evs_stepper_main": {}}

    def on_click(selector):
        rows[f"calculator_evs_stepper_|addible0|_{len(rows) - 1}"] = {}

    page = FakePage(clock, formState=lambda: {"template_RENDER": {"value": {"calculator_evs_stepper": dict(rows)}}},
                    _on_click=on_click)
    _driver(page, clock).apply(Step("calculator_evs_stepper", "add"))
    assert page.clicked == ["[id='calculator_evs_stepper'] .common-addible-addDisk"]
    assert "calculator_evs_stepper_|addible0|_0" in rows


def test_add_step_without_a_new_row_fails():
    clock = FakeClock()
    page = FakePage(clock, formState={"template_RENDER": {"value": {"calculator_evs_stepper": {}}}})
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).apply(Step("calculator_evs_stepper", "add"))
    assert ei.value.details["field"] == "calculator_evs_stepper"


class FakeResponse:
    def __init__(self, request, status=200, body=None):
        self.request, self.url, self.status, self._body = request, request.url, status, body or {}

    def json(self):
        return self._body


RATING = "https://portal-intl.huaweicloud.com/api/cbc/global/rest/BSS/billing/ratingservice/v2/inquiry/resource"


def _capture_page(clock, cart_snapshot, *, grows=True):
    key, item = next(iter(cart_snapshot.items()))
    cart = {}

    def on_click(selector):
        if grows:
            cart[key] = item

    return FakePage(clock, removeOverlays=True, cartKeys=lambda: list(cart), cartItem=lambda k: cart[k],
                    _on_click=on_click)


def test_capture_returns_the_new_card_after_the_price_settles(cart_snapshot):
    clock = FakeClock()
    page = _capture_page(clock, cart_snapshot)
    d = _driver(page, clock)
    req = SimpleNamespace(url=RATING)
    page.emit("request", req)
    clock.now += 1.0
    page.emit("response", FakeResponse(req, body={"amount": 1}))
    card = d.capture()
    assert set(card) == {"buyUrl", "rewriteValue", "selectedProduct"}
    assert card["selectedProduct"]["amount"] == 132.22
    assert page.clicked == ["#rshema_func_priceboard_addToList"]
    assert clock.now >= 2.5  # waited the quiet period after the last rating response


def test_capture_failed_inquiry(cart_snapshot):
    clock = FakeClock()
    page = _capture_page(clock, cart_snapshot)
    d = _driver(page, clock)
    req = SimpleNamespace(url=RATING)
    page.emit("request", req)
    page.emit("response", FakeResponse(req, body={"exceptionId": "CBC.6006"}))
    with pytest.raises(PageEncodeFailed) as ei:
        d.capture()
    assert ei.value.details["step"] == "inquiry" and page.clicked == []


def test_capture_ignores_a_failed_inquiry_of_an_earlier_form_state(cart_snapshot):
    clock = FakeClock()
    page = _capture_page(clock, cart_snapshot)
    page.fns.update(describe=RADIO, clickOption="ok", readBack="C7n")
    d = _driver(page, clock)
    early = SimpleNamespace(url=RATING)
    page.emit("request", early)  # sent while the form was still in its previous state
    d.apply(Step("calculator_ecs_radio_generation", "radio", "C7n"))
    page.emit("response", FakeResponse(early, body={"exceptionId": "CBC.6006"}))
    final = SimpleNamespace(url=RATING)
    page.emit("request", final)
    page.emit("response", FakeResponse(final, body={"amount": 1}))
    assert d.capture()["selectedProduct"]["amount"] == 132.22


def test_capture_cart_never_grows(cart_snapshot):
    clock = FakeClock()
    page = _capture_page(clock, cart_snapshot, grows=False)
    with pytest.raises(PageEncodeFailed) as ei:
        _driver(page, clock).capture()
    assert ei.value.details["step"] == "add_to_list"


def test_capture_price_never_settles(cart_snapshot):
    clock = FakeClock()
    page = _capture_page(clock, cart_snapshot)
    d = _driver(page, clock)
    page.emit("request", SimpleNamespace(url=RATING))  # never answered
    with pytest.raises(PageEncodeFailed) as ei:
        d.capture()
    assert ei.value.details["step"] == "price"


# ---- 4.1 ECS recipe ------------------------------------------------------------

TOKENS = EcsTokens({"arch": "dataInfo_32_", "vmType": "dataInfo_3_", "generation": "C7n", "cpu": "2dataInfo_36_",
                    "mem": "4BSSUNIT.pluralUnit.102"},
                   ("Ubuntu", "Ubuntu 22.04 server 64bit"), [("dataInfo_43_", 40)])


def _ids(steps):
    return [(s.component_id, s.kind, s.value) for s in steps]


@pytest.mark.parametrize("billing,expected", [
    ("monthly", ("global_PERIODTIME_UNSET_PeriodTime", "radio", "1_20")),
    ("yearly", ("global_PERIODTIME_UNSET_PeriodTime", "radio", "1_19")),
    ("ondemand", ("global_ONDEMANDTIME_Stepper_0", "stepper", 730)),
])
def test_recipe_billing_duration(billing, expected):
    steps = _ids(ecs_steps("sa-brazil-1", TOKENS, billing))
    assert steps[0] == ("global_REGIONINFO_region", "region", "sa-brazil-1")
    assert steps[2] == expected
    assert not any(cid.startswith("calculator_ecs_RIRadio") for cid, _, _ in steps)


def test_recipe_ri_sets_term_and_payment_after_the_flavor():
    steps = _ids(ecs_steps("sa-brazil-1", TOKENS, "ri", ri_time="1_3"))
    ids = [cid for cid, _, _ in steps]
    assert ("global_REGIONINFO_chargeMode", "radio", "RI") in steps
    assert ("calculator_ecs_RIRadio_RITime", "radio", "nodeData.1_3") in steps
    assert ("calculator_ecs_RIRadio_paymentType", "radio", "nodeData.NO_UPFRONT") in steps
    assert ids.index("calculator_ecs_radio_mem") < ids.index("calculator_ecs_RIRadio_RITime")
    assert not any(cid.startswith(("global_PERIODTIME", "global_ONDEMANDTIME")) for cid in ids)


def test_recipe_vm_fields_in_narrowing_order():
    ids = [cid for cid, _, _ in _ids(ecs_steps("sa-brazil-1", TOKENS))]
    vm = [cid for cid in ids if cid.startswith("calculator_ecs_radio_")]
    assert vm == [f"calculator_ecs_radio_{f}" for f in ("arch", "vmType", "generation", "cpu", "mem")]
    assert ids.index("calculator_ecs_radio_mem") < ids.index("calculator_ims_select___platform")


@pytest.mark.parametrize("n", [0, 1, 2])
def test_recipe_data_disks(n):
    tokens = EcsTokens(TOKENS.vm, TOKENS.image, [("dataInfo_43_", 40)] + [("dataInfo_43_", 50)] * n)
    steps = _ids(ecs_steps("sa-brazil-1", tokens))
    assert ("calculator_evs_stepper_main_Stepper_0", "stepper", 40) in steps
    assert sum(1 for s in steps if s[1] == "add") == n
    for k in range(n):
        assert (f"calculator_evs_stepper_|addible0|_{k}_type", "select", "dataInfo_43_") in steps
        assert (f"calculator_evs_stepper_|addible0|_{k}_Stepper_0", "stepper", 50) in steps
    rows = {cid.split("_|addible0|_")[1].split("_")[0] for cid, _, _ in steps if "|addible0|" in cid}
    assert len(rows) == n  # each data disk is its own addible row


def test_recipe_bandwidth():
    with_bw = _ids(ecs_steps("sa-brazil-1", TOKENS, bandwidth_mbit=5))
    assert ("calculator_eip_switch_UNSET_Switch", "radio", "calc_14_") in with_bw
    assert ("calculator_eip_radio_Stepper_1", "stepper", 5) in with_bw
    without = _ids(ecs_steps("sa-brazil-1", TOKENS))
    assert ("calculator_eip_switch_UNSET_Switch", "radio", "calc_15_") in without
    assert not any(cid.startswith("calculator_eip_radio") for cid, _, _ in without)


def test_recipe_rejects_what_it_does_not_cover():
    with pytest.raises(ValidationError):
        ecs_steps("sa-brazil-1", TOKENS, bandwidth_mbit=5, bandwidth_type="12_bgp")
    with pytest.raises(ValidationError):
        ecs_steps("sa-brazil-1", TOKENS, "spot")


# ---- 5.1 Edit check ------------------------------------------------------------


def _edit_page(clock, card, *, opens=True, edit_amount=None, form=None, warning=False):
    """A page whose cart holds ``card``; Edit loads its form state, Save re-prices it."""
    key = card["selectedProduct"]["_cartId"]
    summary = {"amount": card["selectedProduct"]["amount"], "timeTag": 1}
    edit = {"stored": None, "current": None, "cartId": None}

    button = CARD_BUTTON.format(key=key)

    def on_click(target):
        if target == f"{button}:Edit" and opens:
            edit.update(stored=card["rewriteValue"], current=form or card["rewriteValue"], cartId=key)
        if target == f"{button}:Save":
            summary.update(amount=edit_amount if edit_amount is not None else summary["amount"], timeTag=2)

    return FakePage(clock, cartSummary=lambda k: dict(summary) if k == key else None, editState=lambda: dict(edit),
                    cartItem=lambda k: card,
                    tagCard=lambda k: k == key, removeOverlays=True, _on_click=on_click,
                    _visible={WARNING_DIALOG: warning})


@pytest.fixture
def saved_card(cart_snapshot):
    card = store.card_from_cart_item(json.loads(json.dumps(next(iter(cart_snapshot.values())))))
    card["selectedProduct"]["_cartId"] = "SYNTHETICCARTID0000000000000000001"
    return card


def test_edit_check_equal_to_the_cent(saved_card):
    clock = FakeClock()
    saved_card["selectedProduct"]["amount"] = 213.9484
    page = _edit_page(clock, saved_card, edit_amount=213.95)
    r = check_card(_driver(page, clock), 0, saved_card)
    assert (r.equal, r.stored, r.edit, r.reason, r.warning) == (True, Decimal("213.95"), Decimal("213.95"), None, False)


def test_edit_check_reports_a_different_price(saved_card):
    clock = FakeClock()
    page = _edit_page(clock, saved_card, edit_amount=114.22)
    r = check_card(_driver(page, clock), 0, saved_card)
    assert not r.equal and r.edit == Decimal("114.22") and "114.22" in r.reason


def test_edit_check_timeout_is_a_failure_with_a_reason(saved_card):
    clock = FakeClock()
    page = _edit_page(clock, saved_card, opens=False)
    r = check_card(_driver(page, clock), 0, saved_card)
    assert not r.equal and r.edit is None and r.reason == "the Edit view did not open"
    assert page.clicked[-1].endswith(":Cancel")  # left edit mode for the next card


def test_edit_check_ignores_failed_inquiries_of_the_refill(saved_card):
    clock = FakeClock()
    page = _edit_page(clock, saved_card)
    d = _driver(page, clock)
    orig = page.fns["editState"]

    def edit_state():  # the refill: a half-filled state's rating fails before the form converges
        state = orig()
        if state["cartId"] and not page.fns.get("_refilled"):
            page.fns["_refilled"] = True
            req = SimpleNamespace(url=RATING)
            page.emit("request", req)
            page.emit("response", FakeResponse(req, body={"exceptionId": "CBC.6006"}))
        return state

    page.fns["editState"] = edit_state
    assert check_card(d, 0, saved_card).equal


def test_edit_check_card_missing_from_the_price_list(saved_card):
    clock = FakeClock()
    page = _edit_page(clock, saved_card)
    page.fns["tagCard"] = False
    r = check_card(_driver(page, clock), 0, saved_card)
    assert not r.equal and "not in the page's price list" in r.reason and page.clicked == []


def test_edit_check_form_state_mismatch_fails_even_at_the_same_price(saved_card):
    clock = FakeClock()
    form = json.loads(json.dumps(saved_card["rewriteValue"]))
    del form["template_RENDER"]["calculator_evs_stepper"]["calculator_evs_stepper_|addible0|_1"]
    page = _edit_page(clock, saved_card, form=form, warning=True)
    r = check_card(_driver(page, clock), 0, saved_card)
    assert not r.equal and r.warning and "calculator_evs_stepper_|addible0|_1" in r.reason


def test_edit_check_warning_alone_does_not_fail(saved_card):
    clock = FakeClock()
    page = _edit_page(clock, saved_card, warning=True)
    r = check_card(_driver(page, clock), 0, saved_card)
    assert r.equal and r.warning
