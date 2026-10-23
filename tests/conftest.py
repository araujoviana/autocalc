# Test helpers live in the ``tests.support`` package; ``pythonpath = .`` in pytest.ini
# puts the repo root on the import path, so this file needs no path changes.

import pytest


@pytest.fixture(autouse=True)
def _no_update_lookup(monkeypatch):
    monkeypatch.setenv("AUTOCALC_NO_UPDATE_CHECK", "1")
