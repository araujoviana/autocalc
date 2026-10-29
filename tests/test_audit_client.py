import pytest

from autocalc import update
from autocalc.client import Calculator, Sku
from autocalc.errors import ValidationError
from autocalc.regions import RegionResolver


def test_obs_disambiguation(tmp_path):
    calc = Calculator(cache_dir=tmp_path)
    size = Sku('obs', 'g', 'c', 'r', 'obs.001', 'storage', {'ondemand': {'usage_factor': 'size'}})
    traffic = Sku('obs', 'g', 'c', 'r', 'obs.001', 'traffic', {'ondemand': {'usage_factor': 'flow'}})
    calc.skus = lambda *args: [traffic, size]
    assert calc.find_sku('obs', 'region', 'obs.001', 'size') is size
    with pytest.raises(ValidationError):
        calc.find_sku('obs', 'region', 'obs.001')


def test_region_aliases_do_not_guess():
    resolver = RegionResolver()
    assert resolver.resolve('Dublin') == 'eu-west-101'
    assert resolver.candidates('Amsterdam') == []
    assert resolver.candidates('la') == []


def test_offline_notice_is_throttled(monkeypatch, tmp_path):
    monkeypatch.delenv('AUTOCALC_NO_UPDATE_CHECK', raising=False)
    monkeypatch.setattr(update, 'config_dir', lambda: tmp_path)
    calls = []
    def offline(repo):
        calls.append(repo)
        raise RuntimeError('offline')
    monkeypatch.setattr(update, 'latest_tag', offline)
    assert update.notice() is None
    assert update.notice() is None
    assert len(calls) == 1


def test_search_rows_keep_usage_identity():
    from autocalc.tools import flat_sku
    row = flat_sku({'spec': 'obs.001', 'description': 'storage', 'prices': {
        'ondemand': {'amount': 1, 'usage_factor': 'size', 'usage_measure_id': 17}}})
    assert row['usage_factor'] == 'size'
    assert row['usage_measure_id'] == 17


def test_cache_recovers_corrupt_json_and_prefers_api(tmp_path):
    import httpx
    calc = Calculator(cache_dir=tmp_path)
    calls = []
    def respond(request):
        calls.append(str(request.url))
        return httpx.Response(200, json={'ok': True})
    calc.http = httpx.Client(transport=httpx.MockTransport(respond))
    assert calc._get_json('https://api.test/data', fallback='https://cdn.test/data') == {'ok': True}
    next(tmp_path.glob('*.json')).write_text('{broken')
    assert calc._get_json('https://api.test/data', fallback='https://cdn.test/data') == {'ok': True}
    assert calls == ['https://api.test/data'] * 2


def test_compare_modes_converts_currency(monkeypatch):
    from autocalc import tools
    monkeypatch.setattr(tools, '_region', lambda value: value)
    monkeypatch.setattr(tools.calc, 'quote', lambda region, items, mode, **kwargs: {'total': 120 if mode == 'yearly' else 10})
    monkeypatch.setattr(tools.calc, 'exchange_rates', lambda: {'BRL': 5})
    result = tools.compare_modes([], currency='BRL')
    assert result['currency'] == 'BRL'
    assert [row['monthly_equivalent'] for row in result['modes']] == [50, 50, 50]
    assert result['modes'][2]['total'] == 600


def test_calculator_construction_has_no_io(tmp_path):
    target = tmp_path / 'cache'
    calc = Calculator(cache_dir=target)
    assert not target.exists()
    assert calc._http is None
