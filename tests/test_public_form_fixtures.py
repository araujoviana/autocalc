"""Synthetic public requests: no customer cards, credentials or account identifiers."""
import json
from pathlib import Path

import pytest

from autocalc.page.replay import form_values, global_values
from autocalc.services import get_builder

CASES = json.loads((Path(__file__).parent / 'fixtures/public/form-requests.json').read_text())


@pytest.mark.parametrize('case', CASES, ids=lambda c: c['service'])
def test_public_request_controls_are_preserved(case):
    form = get_builder(case['service'], object()).form(
        region='sa-brazil-1', billing=case['billing'], quantity=case['quantity'], **case['options'])
    values = form_values(form['template_RENDER'])
    for key, expected in case['controls'].items():
        assert values[key] == expected
    if case['quantity'] != 1:
        assert global_values(form)['global_QUANTITY_Stepper_0'] == case['quantity']
