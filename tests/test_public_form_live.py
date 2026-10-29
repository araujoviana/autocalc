"""Anonymous checks from synthetic, committed requests; never save a list."""
import pytest

from autocalc.client import Calculator
from autocalc.gate import rerate
from autocalc.page.replay import encode_card
from autocalc.page.store import cents
from autocalc.services import get_builder
from tests.test_public_form_fixtures import CASES

pytestmark = pytest.mark.live


@pytest.mark.parametrize('case', CASES, ids=lambda c: c['service'])
def test_public_request_matches_page_and_rating(case):
    calc = Calculator()
    form = get_builder(case['service'], calc).form(
        region='sa-brazil-1', billing=case['billing'], quantity=case['quantity'], **case['options'])
    card = encode_card(case['service'], form)
    assert cents(card['selectedProduct']['amount']) == rerate(card, calc)


def test_bridge_is_fresh_after_navigation_and_vue_mount():
    """Exercise cached JavaScript against real document replacement without remote data."""
    from autocalc.page import store
    from autocalc.page.browser import page_context
    with page_context() as context:
        page = context.new_page()
        page.goto('data:text/html,<div id="app"></div>')
        assert store.js(page, 'ready') is False
        page.evaluate('''() => {
          document.querySelector('#app').__vue_app__ = {
            _instance: {type: {__name: 'template-render'}, subTree: {}}
          };
        }''')
        assert store.js(page, 'ready') is True
        assert store.js(page, 'ready') is True
        page.goto('data:text/html,<div id="app">new</div>')
        assert store.js(page, 'ready') is False
