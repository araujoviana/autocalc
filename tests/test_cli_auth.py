"""CLI parsing unit tests (no network). Auth is covered in test_auth.py."""

import argparse

import pytest

from autocalc.cli import main, parse_item


def test_parse_item_forms():
    assert parse_item("ecs:c7n.large.2.linux*3") == {"service": "ecs", "spec": "c7n.large.2.linux", "quantity": 3}
    assert parse_item("ecs:SSD@100") == {"service": "ecs", "spec": "SSD", "quantity": 1, "size": 100.0}


def test_parse_item_bad():
    with pytest.raises(argparse.ArgumentTypeError):
        parse_item("nonsense")


def test_auth_import_is_gone():
    with pytest.raises(SystemExit):
        main(["auth", "import"])
