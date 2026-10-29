import asyncio

import pytest

from autocalc.core.model import Requirement
from autocalc.errors import SpecNotFound, ValidationError, raise_for_exception


@pytest.mark.parametrize('change', [{'quantity': 0}, {'quantity': 1.5}, {'quantity': True}, {'needs': {'cpu': 4}}, {'needs': {'vcpus': float('nan')}}, {'qty': 2}, {'billing': 'unknown'}])
def test_requirement_rejects_invalid_inputs(change):
    with pytest.raises(ValidationError):
        Requirement.from_dict({'id': 'r', 'service': 'ecs', 'region': 'x', 'billing': 'monthly', **change})


def test_business_error_preserves_public_code():
    with pytest.raises(SpecNotFound) as caught:
        raise_for_exception({'exceptionId': 'CBC.6006'})
    assert caught.value.code == 'SPEC_NOT_FOUND'
    assert caught.value.details['exceptionId'] == 'CBC.6006'


def test_server_returns_structured_argument_error(monkeypatch):
    from autocalc import server
    monkeypatch.setattr(server, 'with_notice', lambda value: value)
    def broken():
        raise TypeError('missing storage_spec')
    result = asyncio.run(server._tool_errors(broken)())
    assert result['error'] == 'VALIDATION'


@pytest.mark.parametrize('value', [float('nan'), float('inf'), float('-inf')])
def test_xlsx_rejects_nonfinite_numbers(value):
    from autocalc.xlsx import Money, Sum, _cell
    for cell in (value, Money(value), Sum(1, 2, value)):
        with pytest.raises(ValueError, match='finite'):
            _cell('A1', cell, 0)


def test_xlsx_columns_beyond_z():
    from autocalc.xlsx import Sheet, _sheet_xml
    xml = _sheet_xml(Sheet('test', [str(i) for i in range(28)], [], []))
    assert 'r="AA1"' in xml
    assert 'r="AB1"' in xml


def test_xlsx_does_not_overwrite(tmp_path):
    from autocalc.xlsx import write_workbook
    path = tmp_path / 'existing.xlsx'
    path.write_text('keep')
    with pytest.raises(FileExistsError):
        write_workbook(path, [])
    assert path.read_text() == 'keep'


def test_auth_probe_uses_session_headers(monkeypatch):
    import httpx

    from autocalc import auth
    from autocalc.share import session_headers
    captured = {}
    def get(url, **kwargs):
        captured.update(kwargs['headers'])
        return httpx.Response(200, json={'retCode': '200'})
    monkeypatch.setattr(httpx, 'get', get)
    assert auth._header_valid('session=x; csrf=y')
    assert captured == session_headers('session=x; csrf=y')


def test_draft_lock_released_after_failure(tmp_path):
    from autocalc.core.store import DraftStore
    store = DraftStore(tmp_path)
    with pytest.raises(RuntimeError), store.lock('d-12345678'):
        raise RuntimeError('failure')
    with store.lock('d-12345678'):
        pass


def test_draft_lock_blocks_other_process(tmp_path):
    import subprocess
    import sys

    from autocalc.core.store import DraftStore
    ready = tmp_path / 'ready'
    entered = tmp_path / 'entered'
    script = '''
import sys
from pathlib import Path
from autocalc.core.store import DraftStore
Path(sys.argv[2]).write_text('ready')
with DraftStore(sys.argv[1]).lock('d-12345678'):
    Path(sys.argv[3]).write_text('entered')
'''
    import time
    with DraftStore(tmp_path).lock('d-12345678'):
        process = subprocess.Popen([sys.executable, '-c', script, str(tmp_path), str(ready), str(entered)])
        try:
            deadline = time.monotonic() + 10
            while not ready.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            assert ready.exists()
            assert not entered.exists()
        except BaseException:
            process.kill()
            process.wait()
            raise
    assert process.wait(timeout=10) == 0
    assert entered.exists()


@pytest.mark.parametrize('change', [{'az': 3}, {'spec': 3}, {'group': ''}])
def test_requirement_rejects_unsupported_zone_and_bad_labels(change):
    with pytest.raises(ValidationError):
        Requirement.from_dict({'id': 'r', 'service': 'ecs', 'region': 'x', 'billing': 'monthly', **change})


def test_revision_batch_validates_before_saving(tmp_path):
    from autocalc.core.draft import decide_many
    from autocalc.core.model import Draft
    from autocalc.core.runs import RunRecord
    from autocalc.core.store import DraftStore
    store = DraftStore(tmp_path)
    draft = Draft('d-12345678', 'test', 'test', [Requirement('r', 'ecs', 'x', 'monthly')])
    store.save(draft)
    run = RunRecord(tmp_path, draft.id)
    run.append('candidates', requirement_id='r', candidates=[{'spec': 'valid'}])
    with pytest.raises(ValidationError):
        decide_many(store, draft.id, [
            {'requirement_id': 'r', 'spec': 'valid', 'justification': 'chosen'},
            {'requirement_id': 'other', 'spec': 'invalid', 'justification': 'bad'},
        ])
    assert store.load(draft.id).decisions == []
    assert not any(event['kind'] == 'decision' for event in run.read())


def test_unknown_publication_recovery_requires_reconciliation(tmp_path):
    from autocalc.core.model import Draft
    from autocalc.core.store import DraftStore
    store = DraftStore(tmp_path)
    draft = Draft('d-12345678', 'test', 'test', publishing=True)
    store.save(draft)
    assert store.inspect(draft.id)['state'] == 'unknown_outcome'
    with pytest.raises(ValidationError):
        store.recover(draft.id, False, 'unchecked')
    assert store.load(draft.id).publishing
    assert store.recover(draft.id, True, 'User checked saved lists; no list was created')['state'] == 'ready'
    assert not store.load(draft.id).publishing


def test_empty_draft_rejected_before_provider_work(tmp_path):
    from types import SimpleNamespace

    from autocalc.core.draft import draft_quote
    from autocalc.core.store import DraftStore
    with pytest.raises(ValidationError, match='at least one'):
        draft_quote(SimpleNamespace(), 'test', [], DraftStore(tmp_path))


def test_zone_metadata_roundtrips_but_cannot_be_quoted(tmp_path):
    from types import SimpleNamespace

    from autocalc.core.draft import draft_quote
    from autocalc.core.store import DraftStore
    req = Requirement('r', 'ecs', 'x', 'monthly', az='az1')
    assert Requirement.from_dict(req.to_dict()).az == 'az1'
    with pytest.raises(ValidationError, match='Availability-zone'):
        draft_quote(SimpleNamespace(), 'test', [req], DraftStore(tmp_path))


def test_auth_network_failure_is_not_signed_out(monkeypatch):
    import httpx

    from autocalc import auth
    from autocalc.errors import UpstreamError
    def fail(*args, **kwargs):
        raise httpx.ConnectError('offline')
    monkeypatch.setattr(httpx, 'get', fail)
    with pytest.raises(UpstreamError, match='saved login'):
        auth._header_valid('cookie=value')


def test_browser_auth_probe_failure_is_not_signed_out():
    from types import SimpleNamespace

    from autocalc import auth
    from autocalc.errors import UpstreamError
    def fail(*args, **kwargs):
        raise RuntimeError('network unavailable')
    with pytest.raises(UpstreamError):
        auth._probe_login(SimpleNamespace(request=SimpleNamespace(get=fail)), 0)


def test_cookie_export_restricts_domain_boundary():
    from autocalc import auth
    assert auth._cookie_header([
        {'domain': 'evilhuaweicloud.com', 'name': 'bad', 'value': 'excluded'},
        {'domain': '.huaweicloud.com', 'name': 'good', 'value': 'included'},
    ]) == 'good=included'


def test_public_session_copy_uses_authenticated_endpoint():
    import httpx

    from autocalc.share import Session
    calls = []
    def handle(request):
        calls.append(request)
        return httpx.Response(200, json={'retCode': '200', 'data': 'copied-id'})
    session = Session('session=x', transport=httpx.MockTransport(handle))
    assert session.copy('original') == 'copied-id'
    assert calls[0].method == 'POST'
    assert calls[0].url.params['key'] == 'original'
    assert calls[0].headers['cookie'] == 'session=x'


def test_cli_optional_scalar_and_true_boolean_default(monkeypatch):
    import argparse

    from autocalc import cli, tools
    def example(limit: int | None = None, enabled: bool = True):
        return limit, enabled
    monkeypatch.setattr(tools, 'REGISTRY', {'example': example})
    parser = argparse.ArgumentParser()
    cli._add_tool_commands(parser.add_subparsers(dest='command'), set())
    values = parser.parse_args(['example', '--limit', '7', '--no-enabled'])
    assert values.limit == 7
    assert values.enabled is False
    assert parser.parse_args(['example']).enabled is True
