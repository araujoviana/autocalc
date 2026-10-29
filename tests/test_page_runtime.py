"""Runtime bridge installation and resource budgeting, without browser/network access."""
import pytest

from autocalc.errors import ValidationError
from autocalc.page import browser, store


class BridgePage:
    def __init__(self):
        self.installed = False
        self.scripts = []

    def evaluate(self, script, arg=None):
        self.scripts.append(script)
        if script == store.INSTALL_SCRIPT:
            self.installed = True
            return None
        assert script == store.SCRIPT
        return arg['fn'] if self.installed else store.INSTALL_REQUIRED


def test_bridge_installs_once_and_reinstalls_after_navigation():
    page = BridgePage()
    assert store.js(page, 'ready') == 'ready'
    assert store.js(page, 'version') == 'version'
    assert page.scripts.count(store.INSTALL_SCRIPT) == 1
    assert len(store.SCRIPT) < 500
    page.installed = False
    assert store.js(page, 'ready') == 'ready'
    assert page.scripts.count(store.INSTALL_SCRIPT) == 2


@pytest.mark.parametrize('available,cpus,expected', [(512, 8, 1), (2048, 8, 2), (8192, 8, 3), (8192, 1, 1), (None, 8, 1)])
def test_browser_worker_budget(monkeypatch, available, cpus, expected):
    monkeypatch.delenv('AUTOCALC_ENCODE_WORKERS', raising=False)
    monkeypatch.setattr(browser, '_available_memory_bytes', lambda: None if available is None else available * 1024 ** 2)
    monkeypatch.setattr(browser.os, 'cpu_count', lambda: cpus)
    assert browser.encode_workers() == expected


@pytest.mark.parametrize('setting', ['0', '-1', 'invalid', '17'])
def test_worker_override_is_validated_at_runtime(monkeypatch, setting):
    monkeypatch.setenv('AUTOCALC_ENCODE_WORKERS', setting)
    with pytest.raises(ValidationError):
        browser.encode_workers()
