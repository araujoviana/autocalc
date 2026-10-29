import pytest

from autocalc.errors import ValidationError
from autocalc.services import VERIFIED, get_builder
from autocalc.services.forms import RECIPES


@pytest.mark.parametrize('service', [s for s, r in RECIPES.items() if not r.quantity])
def test_recipe_rejects_unrepresented_quantity(service):
    builder = get_builder(service, object())
    with pytest.raises(ValidationError):
        builder.build('test', billing=builder.modes[0], quantity=3)


def test_redis_rejects_zero_priced_mode():
    with pytest.raises(ValidationError):
        get_builder('redis', object()).build('test', billing='ondemand')


@pytest.mark.parametrize('options', [
    {'storage_class': 'typo'},
    {'billing': 'monthly'},
    {'storage_class': 'cold', 'multi_az': True},
    {'components': [{'factor': 'size', 'value': 10}]},
    {'components': [{'factor': 'typo', 'value': 10}]},
])
def test_obs_invalid_request_fails_before_catalog_access(options):
    with pytest.raises(ValidationError):
        get_builder('obs', object()).build('test', **options)


def test_unverified_compute_and_storage_defaults_cannot_publish():
    assert not {'function', 'lts', 'eip', 'hecs'} & set(VERIFIED)


@pytest.mark.parametrize('cluster_type', ['turbo', 'typo'])
def test_cce_rejects_unverified_cluster_type_before_catalog(cluster_type):
    with pytest.raises(ValidationError):
        get_builder('cce', object()).build('test', cluster_type=cluster_type)


def test_ecs_rejects_ambiguous_image_before_selecting_catalog_order(monkeypatch):
    builder = get_builder('ecs', object())
    monkeypatch.setattr(builder, 'catalog', lambda *a: {})
    monkeypatch.setattr(builder, 'product', lambda *a: {
        'arch': 'x86', 'vmType': 'general', 'spec': 'small', 'cpu': '2', 'mem': '4'})
    monkeypatch.setattr(builder, 'images', lambda *a: [
        {'id': 'a', 'name': 'AlmaLinux 9.4'}, {'id': 'b', 'name': 'AlmaLinux 9.5'}])
    with pytest.raises(ValidationError, match='multiple catalog images'):
        builder.build('test', 'small', image='AlmaLinux')


@pytest.mark.parametrize('options', [
    {'components': [{'factor': 'get_warm', 'value': 3}]},
    {'components': [{'factor': 'size_3az', 'value': 3, 'unit': 'GB'}]},
    {'components': [{'factor': 'get', 'value': float('nan')}]},
    {'components': [{'factor': 'get', 'value': -1}]},
    {'components': [{'factor': 'get', 'value': 1}, {'factor': 'get', 'value': 2}]},
    {'components': [{'factor': 'get', 'value': 1}], 'quantity': 3},
    {'package': 'small', 'components': [{'factor': 'get', 'value': 1}]},
])
def test_obs_rejects_unrepresentable_components_before_catalog(options):
    with pytest.raises(ValidationError):
        get_builder('obs', object()).build('test', **options)


def test_obs_multi_az_is_explicit_even_without_storage_component():
    builder = get_builder('obs', object())
    form = builder._template([{'factor': 'get', 'value': 1}], 'dataInfo_2_', 'dataInfo_5_')
    assert form['calculator_multiAZ_radio']['multiAZType'] == 'dataInfo_5_'



def test_lts_page_form_preserves_zero_daily_inputs_and_cold_retention():
    builder = get_builder('lts', object())
    form = builder.form(region='test', flow_gb_per_day=0, cold_enabled=True,
                        retention_days=90, hot_retention_days=7, months=2)
    render = form['template_RENDER']
    assert render['calculator_ltsLogFlow_stepper']['UNSET_Stepper_0']['measureValue'] == 0
    assert render['calculator_ltsStorage_stepper']['UNSET_Stepper_0']['measureValue'] == 90
    assert render['calculator_ltsHotStorage_stepper']['UNSET_Stepper_0']['measureValue'] == 7
    assert form['global_ONDEMANDTIME']['UNSET_Stepper_0']['measureValue'] == 2
    assert 'lts' not in VERIFIED


@pytest.mark.parametrize('options', [
    {'storage_mb': 720}, {'cold_mb': 720}, {'flow_gb_per_day': float('inf')},
    {'index_percent': 101}, {'cold_enabled': True, 'hot_retention_days': 31, 'retention_days': 30},
])
def test_lts_rejects_ambiguous_or_invalid_inputs(options):
    with pytest.raises(ValidationError):
        get_builder('lts', object()).form(region='test', **options)



def test_capability_discovery_distinguishes_publication_support():
    from autocalc.services import supported_services
    rows = {row['service']: row for row in supported_services()}
    assert rows['ecs']['publication_supported'] is True
    for service in ('lts', 'function', 'eip', 'redis'):
        assert rows[service]['publication_supported'] is False
        assert rows[service]['publication_blocked_reason']
    assert rows['eip']['verified_frontend'] is None


def test_lts_legacy_builder_rejects_unrepresentable_usage_totals():
    with pytest.raises(ValidationError, match='Legacy LTS'):
        get_builder('lts', object()).build('test', storage_mb=720)


def test_lts_publication_signature_matches_page_inputs():
    builder = get_builder('lts', object())
    builder.input_signature().bind(region='test', billing='ondemand', quantity=1,
                                   flow_gb_per_day=10, retention_days=7)


@pytest.mark.parametrize('entry', ['build', 'build_ri', '_price_ri'])
def test_ecs_local_reserved_instance_prices_are_disabled(entry):
    builder = get_builder('ecs', object())
    with pytest.raises(ValidationError):
        if entry == 'build':
            builder.build('test', 'small', billing='ri')
        else:
            getattr(builder, entry)('test', 'small')
    assert 'ri' not in builder.modes


def test_function_positive_compute_fails_before_catalog_access():
    with pytest.raises(ValidationError, match='no reliable upstream price'):
        get_builder('function', object()).build('test', gb_seconds=1)
