from autocalc.services.base import Builder


class Example(Builder):
    def build(self, region='test', billing='monthly', quantity=1):
        return self.assemble(region, billing, 1, 730, quantity, [], 'example', {'option': 3})


def test_form_only_never_rates_and_preserves_globals(monkeypatch):
    builder = Example(object())
    def no_price(*args):
        raise AssertionError('form must never rate')
    monkeypatch.setattr(builder, 'price', no_price)
    form = builder.form(region='test', quantity=3)
    assert form['global_QUANTITY']['UNSET_Stepper_0']['measureValue'] == 3
    assert form['template_RENDER'] == {'option': 3}
    assert form['global_PERIODTIME']['UNSET_PeriodTime']['measureValue'] == 1


def test_form_only_context_is_reset_after_failure(monkeypatch):
    builder = Example(object())
    try:
        builder.form(billing='invalid')
    except KeyError:
        pass
    called = []
    monkeypatch.setattr(builder, 'price', lambda *args: called.append(True))
    assert 'selectedProduct' in builder.build()
    assert called == [True]
