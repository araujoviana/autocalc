import pytest

from autocalc import tools
from autocalc.errors import ValidationError


@pytest.mark.parametrize('name', ['', '   ', 'x' * 51, None])
def test_rename_validates_name_before_read_or_write(name, monkeypatch):
    from autocalc import share
    monkeypatch.setattr(share, 'share_detail', lambda *a: pytest.fail('read before validation'))
    with pytest.raises(ValidationError):
        tools.rename_price_list('id', name)


def test_duplicate_validates_name_before_copy(monkeypatch):
    from autocalc import share
    monkeypatch.setattr(share, 'Session', lambda: pytest.fail('session before validation'))
    with pytest.raises(ValidationError):
        tools.duplicate_price_list('id', 'x' * 51)
