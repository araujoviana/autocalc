import pytest

from autocalc.client import Calculator, Sku
from autocalc.errors import UnexpectedResponse, ValidationError


@pytest.mark.parametrize('options', [
    {'billing': 'typo'}, {'hours': float('nan')}, {'hours': -1}, {'periods': 0},
])
def test_quote_rejects_invalid_terms_before_catalog(options, monkeypatch):
    calc = Calculator()
    monkeypatch.setattr(calc, 'find_sku', lambda *a: pytest.fail('catalog accessed'))
    with pytest.raises(ValidationError):
        calc.quote('region', [{'service': 'ecs', 'spec': 'x'}], **options)


@pytest.mark.parametrize('item', [
    {'quantity': 1.5}, {'quantity': 0}, {'quantity': True}, {'size': float('inf')},
    {'usage_value': -1}, {'qty': 3},
])
def test_quote_rejects_invalid_item_before_catalog(item, monkeypatch):
    calc = Calculator()
    monkeypatch.setattr(calc, 'find_sku', lambda *a: pytest.fail('catalog accessed'))
    with pytest.raises(ValidationError):
        calc.quote('region', [{'service': 'ecs', 'spec': 'x', **item}])


def test_quote_rejects_incomplete_rating_result(monkeypatch):
    calc = Calculator()
    monkeypatch.setattr(calc, 'find_sku', lambda *args: Sku('ecs', 'g', 'c', 'r', 'x', '', {'monthly': {'amount': 1}}))
    monkeypatch.setattr(calc, 'inquiry', lambda body: {'productRatingResult': []})
    with pytest.raises(UnexpectedResponse):
        calc.quote('region', [{'service': 'ecs', 'spec': 'x'}], billing='monthly')


def test_compare_modes_normalizes_multiple_periods(monkeypatch):
    from autocalc import tools
    monkeypatch.setattr(tools, '_region', lambda value: value)
    calls = []
    def quote(region, items, mode, **kwargs):
        calls.append(kwargs)
        return {'total': {'ondemand': 100, 'monthly': 160, 'yearly': 1200}[mode]}
    monkeypatch.setattr(tools.calc, 'quote', quote)
    result = tools.compare_modes([], periods=2, hours=400)
    assert [r['monthly_equivalent_usd'] for r in result['modes']] == [100, 80, 50]
    assert calls == [{'hours': 400, 'periods': 2}] * 3
