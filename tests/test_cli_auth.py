"""CLI parsing and auth helpers unit tests (no network)."""

import argparse

import pytest

from autocalc.auth import parse_curl, redact_cookie_header
from autocalc.cli import parse_item


def test_parse_item_forms():
    assert parse_item("ecs:c7n.large.2.linux*3") == {"service": "ecs", "spec": "c7n.large.2.linux", "quantity": 3}
    assert parse_item("ecs:SSD@100") == {"service": "ecs", "spec": "SSD", "quantity": 1, "size": 100.0}


def test_parse_item_bad():
    with pytest.raises(argparse.ArgumentTypeError):
        parse_item("nonsense")


def test_parse_curl_bash():
    text = "curl 'https://x/api/share/list' -H 'origin: https://www.huaweicloud.com' -b 'cbc-sid=abc; HWS_INTL_ID=def'"
    assert parse_curl(text) == "cbc-sid=abc; HWS_INTL_ID=def"


def test_redaction_hides_values():
    red = redact_cookie_header("cbc-sid=SECRET; HWS_INTL_ID=SECRET2")
    assert "SECRET" not in red and "2 cookies" in red


def test_migrate_curl(tmp_path):
    f = tmp_path / ".session.curl"
    f.write_text("curl 'https://x' -b 'cbc-sid=z'")
    assert parse_curl(f.read_text()) == "cbc-sid=z"
