from decimal import Decimal as D

import pytest

from autocalc import gate
from autocalc.errors import GateFailed
from autocalc.gate import CardCheck, publish_checked
from autocalc.page.edit_check import EditResult


def card(amount=10.0, title="custom.ecs 1"):
    return {"selectedProduct": {"amount": amount, "_customTitle": title, "serviceCode": "ecs", "productAllInfos": [],
                                "chargeModeName": "MONTHLY"},
            "rewriteValue": {}}


class FakeSession:
    def __init__(self, delete_fails=False):
        self.created, self.deleted, self.delete_fails = [], [], delete_fails

    def create(self, payload):
        self.created.append(payload)
        return "L1"

    def delete(self, list_id):
        if self.delete_fails:
            raise RuntimeError("boom")
        self.deleted.append(list_id)


def checker(*checks, issues=()):
    return lambda list_id, calc: (list(checks), list(issues))


def publish(session, check):
    return publish_checked("n", [card()], session=session, calc=object(), check=check)


def test_all_agree_returns_the_link_and_keeps_the_list():
    s = FakeSession()
    out = publish(s, checker(CardCheck(0, "t", D("10"), D("10"), D("10"))))
    assert out["url"].endswith("shareListId=L1&currentCurrency=USD") and s.deleted == []
    assert out["checks"][0]["ok"]


def test_a_failing_card_deletes_the_list_and_reports_both_amounts():
    s = FakeSession()
    bad = CardCheck(0, "t", D("10.48"), D("10.48"), D("9.83"), ["Edit re-prices to 9.83, stored 10.48"])
    with pytest.raises(GateFailed) as ei:
        publish(s, checker(bad))
    assert s.deleted == ["L1"]
    c = ei.value.details["cards"][0]
    assert (c["stored"], c["edit"], c["ok"]) == ("10.48", "9.83", False)


def test_a_list_level_issue_fails_too():
    s = FakeSession()
    with pytest.raises(GateFailed) as ei:
        publish(s, checker(CardCheck(0, "t", D("1"), D("1"), D("1")), issues=["totalPrice 2 != sum(items) 1"]))
    assert s.deleted == ["L1"] and {"issue": "totalPrice 2 != sum(items) 1"} in ei.value.details["cards"]


def test_a_check_that_cannot_run_fails_closed():
    def broken(list_id, calc):
        raise RuntimeError("no browser")

    s = FakeSession()
    with pytest.raises(GateFailed, match="could not run: no browser") as ei:
        publish(s, broken)
    assert s.deleted == ["L1"] and isinstance(ei.value.__cause__, RuntimeError)


def test_failed_delete_names_the_list():
    with pytest.raises(GateFailed, match="delete list L1 by hand") as ei:
        publish(FakeSession(delete_fails=True), checker(CardCheck(0, "t", D("1"), problems=["x"])))
    assert ei.value.details["list_id"] == "L1"


def test_keep_on_fail_keeps_and_names_the_list(monkeypatch):
    monkeypatch.setenv("AUTOCALC_KEEP_ON_FAIL", "1")
    s = FakeSession()
    with pytest.raises(GateFailed, match="L1 was kept") as ei:
        publish(s, checker(CardCheck(0, "t", D("1"), problems=["x"])))
    assert s.deleted == [] and ei.value.details["list_id"] == "L1"


def test_verify_combines_rating_edit_and_validation(monkeypatch):
    monkeypatch.setattr(gate, "share_detail", lambda calc, lid: {"cartListData": [card(10), card(20, "b")]})
    monkeypatch.setattr(gate, "validate_list", lambda d: {"issues": ["[b] product x: no inquiryResult", "list-level"]})
    rates = {10.0: D("10.00"), 20.0: D("19.99")}
    edits = lambda lid: [EditResult(0, D("10"), D("10"), True), EditResult(1, D("20"), None, False, "Edit view did not open")]  # noqa: E731
    checks, issues = gate.verify("L1", object(), edit=edits, rate=lambda c: rates[c["selectedProduct"]["amount"]])
    assert checks[0].ok and checks[0].rated == D("10.00")
    assert checks[1].problems == ["rating engine prices the products at 19.99, stored 20.00",
                                  "Edit view did not open", "[b] product x: no inquiryResult"]
    assert issues == ["list-level"]


def test_verify_marks_an_unratable_or_unchecked_card_failed(monkeypatch):
    monkeypatch.setattr(gate, "share_detail", lambda calc, lid: {"cartListData": [card(10)]})
    monkeypatch.setattr(gate, "validate_list", lambda d: {"issues": []})

    def explode(c):
        raise ValueError("no price")

    (chk,), _ = gate.verify("L1", object(), edit=lambda lid: [], rate=explode)
    assert chk.problems == ["could not be re-priced: no price", "the Edit check returned no result for this card"]


def test_quantity_tokens_reach_both_the_form_state_and_the_purchase_quantity():
    from autocalc.services.base import Builder

    b = Builder(calc=object())
    b.service = "evs"
    c = b.assemble("r", "monthly", 1, 730, 2, [{}], "d", {}, price_fn=lambda p: None, quantity_tokens=("calc_5_", "calc_6_"))
    step = c["rewriteValue"]["global_QUANTITY"]["UNSET_Stepper_0"]
    assert (step["measureNameBeforeTrans"], step["measurePluralNameBeforeTrans"]) == ("calc_5_", "calc_6_")
    pn = c["selectedProduct"]["purchaseNum"]
    assert (pn["measureNameBeforeTrans"], pn["measurePluralNameBeforeTrans"]) == ("calc_5_", "calc_6_")



def test_empty_publication_creates_nothing():
    from autocalc.errors import ValidationError
    session = FakeSession()
    with pytest.raises(ValidationError, match='empty'):
        publish_checked('n', [], session=session, calc=object())
    assert session.created == []


@pytest.mark.parametrize('indices', [[], [1], [0, 0], [0, 1]])
def test_gate_rejects_missing_duplicate_and_unexpected_checks(indices):
    session = FakeSession()
    with pytest.raises(GateFailed):
        publish(session, checker(*(CardCheck(i, 't', D('10')) for i in indices)))
    assert session.deleted == ['L1']


@pytest.mark.parametrize('mutation', ['form', 'quantity', 'spec', 'missing'])
def test_verify_compares_saved_cards_to_request(monkeypatch, mutation):
    import copy
    expected = card()
    expected['rewriteValue'] = {'global_QUANTITY': {'UNSET_Stepper_0': {'measureValue': 3}},
                                'template_RENDER': {'size': 100}}
    expected['selectedProduct']['productAllInfos'] = [{'resourceSpecCode': 'requested', 'productNum': 3}]
    saved = copy.deepcopy(expected)
    if mutation == 'form':
        saved['rewriteValue']['template_RENDER']['size'] = 1
    elif mutation == 'quantity':
        saved['selectedProduct']['productAllInfos'][0]['productNum'] = 1
    elif mutation == 'spec':
        saved['selectedProduct']['productAllInfos'][0]['resourceSpecCode'] = 'wrong'
    detail = {'cartListData': [] if mutation == 'missing' else [saved]}
    monkeypatch.setattr(gate, 'share_detail', lambda *_: detail)
    monkeypatch.setattr(gate, 'validate_list', lambda _: {'issues': []})
    checks, issues = gate.verify('L1', object(), edit=lambda _: [EditResult(0, D('10'), D('10'), True)] if mutation != 'missing' else [],
                                rate=lambda _: D('10'), expected_cards=[expected])
    assert issues or any(not check.ok for check in checks)


def test_verify_rejects_duplicate_edit_results(monkeypatch):
    monkeypatch.setattr(gate, 'share_detail', lambda *_: {'cartListData': [card()]})
    monkeypatch.setattr(gate, 'validate_list', lambda _: {'issues': []})
    result = EditResult(0, D('10'), D('10'), True)
    _, issues = gate.verify('L1', object(), edit=lambda _: [result, result], rate=lambda _: D('10'))
    assert any('duplicate' in issue for issue in issues)
