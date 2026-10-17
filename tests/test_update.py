"""``autocalc update``: tag choice, argument checks and failures. git and uv are faked."""

import subprocess

import pytest

from autocalc import update
from autocalc.errors import UpdateFailed


def run_with(monkeypatch, tags="", git_rc=0, uv_rc=0):
    calls = []

    def fake(cmd, **_kw):
        calls.append(cmd)
        if cmd[0] == "git":
            out = "".join(f"abc\trefs/tags/{t}\n" for t in tags.split())
            return subprocess.CompletedProcess(cmd, git_rc, out, "denied")
        return subprocess.CompletedProcess(cmd, uv_rc, "", "boom")

    monkeypatch.setattr(update.subprocess, "run", fake)
    monkeypatch.setenv("AUTOCALC_REPO", "file:///repo")
    return calls


def test_newest_tag_is_compared_by_number_and_installed(monkeypatch):
    calls = run_with(monkeypatch, "v0.9.0 v0.10.0 v0.2.1 v1.0.0-rc1 nightly")
    out = update.update()
    assert calls[-1] == ["uv", "tool", "install", "--force", "git+file:///repo@v0.10.0"]
    assert out.endswith("-> 0.10.0")


def test_pinned_tag_skips_the_listing(monkeypatch):
    calls = run_with(monkeypatch, "v9.0.0")
    update.update("v0.1.0")
    assert [c[0] for c in calls] == ["uv"] and calls[0][-1].endswith("@v0.1.0")


def test_not_a_release_tag_runs_nothing(monkeypatch):
    calls = run_with(monkeypatch)
    with pytest.raises(UpdateFailed, match="vX.Y.Z"):
        update.update("main")
    assert calls == []


def test_no_tag_and_failures_are_named(monkeypatch):
    run_with(monkeypatch, "")
    with pytest.raises(UpdateFailed, match="No release tag"):
        update.update()
    run_with(monkeypatch, "", git_rc=128)
    with pytest.raises(UpdateFailed, match="list the release tags"):
        update.update()
    run_with(monkeypatch, "v0.2.0", uv_rc=1)
    with pytest.raises(UpdateFailed, match="v0.2.0") as exc:
        update.update()
    assert exc.value.code == "UPDATE_FAILED"
