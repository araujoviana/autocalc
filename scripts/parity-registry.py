"""Diff the Python and TypeScript tool registries (ts-parity task 1.2).

Compares tool names, input property names and which are required. Exits 1 on any difference.
"""

from __future__ import annotations

import inspect
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def python_side() -> dict[str, dict[str, list[str]]]:
    from autocalc import quote_file, tools, workflow  # noqa: F401  (importing registers the tools)

    out = {}
    for name, fn in tools.REGISTRY.items():
        params = inspect.signature(fn).parameters.values()
        out[name] = {"properties": sorted(p.name for p in params),
                     "required": sorted(p.name for p in params if p.default is inspect.Parameter.empty)}
    return out


def typescript_side() -> dict[str, dict[str, list[str]]]:
    bun = ROOT / "experimental" / "bun"
    run = subprocess.run(["bun", "scripts/dump-registry.ts"], cwd=bun, capture_output=True, text=True, check=True)
    return json.loads(run.stdout)


# TS shares one schema between MCP and CLI; these are documented Python CLI flags (docs/reference/cli.md) that Python keeps off MCP.
CLI_ONLY = {"search_skus": {"refresh"}, "auth_login": {"timeout"}}


def diff(py: dict, ts: dict) -> list[str]:
    lines = [f"only in Python: {n}" for n in sorted(py.keys() - ts.keys())]
    lines += [f"only in TypeScript: {n}" for n in sorted(ts.keys() - py.keys())]
    for name in sorted(py.keys() & ts.keys()):
        for key in ("properties", "required"):
            a, b = set(py[name][key]), set(ts[name][key]) - CLI_ONLY.get(name, set())
            if a != b:
                lines.append(f"{name}.{key}: Python-only {sorted(a - b)}, TypeScript-only {sorted(b - a)}")
    return lines


def main() -> int:
    lines = diff(python_side(), typescript_side())
    print("\n".join(lines) if lines else "registries match")
    return 1 if lines else 0


if __name__ == "__main__":
    sys.exit(main())
