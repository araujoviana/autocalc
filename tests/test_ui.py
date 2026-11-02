"""Terminal rendering: plain for pipes and NO_COLOR, glyphs with an ASCII fallback, aligned tables."""

import io
import json

import pytest

from autocalc import cli, ui


class Tty(io.StringIO):
    def __init__(self, encoding="utf-8", tty=True):
        super().__init__()
        self._enc, self._tty = encoding, tty

    encoding = property(lambda self: self._enc)

    def isatty(self):
        return self._tty


@pytest.fixture
def tty(monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setenv("TERM", "xterm")
    # pytest swaps sys.stdout again between setup and call, so the test installs the fake itself
    def install():
        out = Tty()
        monkeypatch.setattr("sys.stdout", out)
        return out
    return install


def test_no_color_when_not_a_tty_or_no_color_is_set(monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setenv("TERM", "xterm")
    assert not ui.fancy(Tty(tty=False)) and ui.paint("x", "red", Tty(tty=False)) == "x"
    assert ui.fancy(Tty())
    monkeypatch.setenv("NO_COLOR", "1")
    assert not ui.fancy(Tty()) and ui.paint("x", "red", Tty()) == "x"
    monkeypatch.delenv("NO_COLOR")
    monkeypatch.setenv("TERM", "dumb")
    assert not ui.fancy(Tty())


def test_status_is_the_old_plain_line_for_pipes_and_colored_glyphs_on_a_terminal(monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setenv("TERM", "xterm")
    pipe = Tty(tty=False)
    assert [ui.status(k, "t", pipe) for k in ("ok", "warn", "fail")] == ["[ok]   t", "[warn] t", "[FAIL] t"]
    assert ui.status("ok", "t", Tty()) == "\x1b[32m✓\x1b[0m t"
    assert ui.status("fail", "t", Tty()).startswith("\x1b[31m✗")


def test_glyphs_fall_back_to_ascii_when_the_encoding_cannot_print_them(monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    monkeypatch.setenv("TERM", "xterm")
    line = ui.status("warn", "t", Tty(encoding="cp1252"))  # cp1252 has no ✓/✗ ...
    assert "⚠" not in line and "[warn]" in line
    assert "✓" not in ui.status("ok", "t", Tty(encoding="ascii")) and "[ok]" in ui.status("ok", "t", Tty(encoding="ascii"))


def test_table_aligns_columns_and_leaves_the_last_one_unpadded(monkeypatch):
    monkeypatch.setenv("NO_COLOR", "1")
    out = ui.table([("ecs", "Elastic Cloud Server", "compute"), ("obs", "Object Storage", "storage")],
                   ("SERVICE", "NAME", "CATEGORY")).splitlines()
    assert out[0] == "SERVICE  NAME                  CATEGORY"
    assert out[1] == "ecs      Elastic Cloud Server  compute"
    assert out[2].index("Object") == out[1].index("Elastic") and not out[2].endswith(" ")
    assert ui.table([]) == ""


def test_coverage_on_a_terminal_ends_with_a_one_line_summary_and_json_flag_keeps_json(tty):
    out = tty()
    assert cli.main(["schema", "coverage", "ecs"]) == 0
    text = out.getvalue()
    assert "Coverage 16/16 mapped (100%), 3 unsupported" in text and not text.lstrip().startswith("{")
    out.truncate(0)
    out.seek(0)
    assert cli.main(["schema", "coverage", "ecs", "--json"]) == 0
    assert json.loads(out.getvalue())["mapped_percent"] == 100


def test_coverage_through_a_pipe_is_unchanged_json(capsys, monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    assert cli.main(["schema", "coverage", "ecs"]) == 0
    assert json.loads(capsys.readouterr().out)["service"] == "ecs"


def test_plan_view_lists_cards_and_says_whether_apply_is_ready():
    ready = {"cards": [{"id": "web", "spec": "c7n.large.2", "price": "10", "unmapped_options": []}]}
    stuck = {"cards": [{"id": "db", "candidates": [{}, {}], "unmapped_options": ["x"]}]}
    assert "1 cards resolved; ready to apply" in cli._quote_view("plan-quote", ready)
    out = cli._quote_view("plan-quote", stuck)
    assert "2 candidates: choose a spec" in out and "1 of 1 cards need attention" in out
    assert cli._quote_view("draft-quote", ready) is None
    assert "https://u" in cli._quote_view("apply-quote", {"url": "https://u", "name": "n", "checks": [1, 2]})


def test_tool_commands_print_exact_json_through_a_pipe(capsys, monkeypatch):
    monkeypatch.delenv("NO_COLOR", raising=False)
    from autocalc import tools
    monkeypatch.setitem(tools.REGISTRY, "plan_quote", lambda path: {"cards": [], "pending": []})
    assert cli.main(["plan-quote", "--path", "x"]) == 0
    assert json.loads(capsys.readouterr().out) == {"cards": [], "pending": []}


def test_errors_print_the_same_text_without_color_when_stderr_is_a_pipe(capsys):
    from autocalc.errors import ValidationError
    assert cli._print_err(ValidationError("bad", hint="try x")) == 2
    assert capsys.readouterr().err == "error[VALIDATION]: bad\n  -> try x\n"
