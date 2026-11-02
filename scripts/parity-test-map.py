"""Map each Python test file to its TypeScript counterpart (ts-parity task 1.3).

The map is hand-written: a counterpart means "covers the same behavior", not "same name".
Exits 1 when a Python test file is not listed, or a listed TypeScript file does not exist.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TS = ROOT / "experimental" / "bun" / "tests"

MAP: dict[str, list[str]] = {
    "test_audit_client": ["unit/transport.test.ts"],
    "test_audit_contracts": ["unit/audit-regressions.test.ts"],
    "test_auth": ["unit/auth.test.ts", "unit/session-store.test.ts"],
    "test_builders_golden": ["unit/golden.test.ts"],
    "test_cache_hygiene": ["unit/cache.test.ts"],
    "test_core_huawei": ["unit/core-huawei.test.ts"],
    "test_core_model": ["unit/core-model.test.ts"],
    "test_core_ranking": ["unit/core-ranking.test.ts"],
    "test_core_draft": ["unit/core-draft.test.ts"],
    "test_core_runs": ["unit/core-runs.test.ts"],
    "test_core_store": ["unit/core-store.test.ts"],
    "test_cli_auth": ["unit/cli-syntax.test.ts"],
    "test_ecs_defaults": ["unit/ecs.test.ts"],
    "test_list_names": ["unit/lists.test.ts"],
    "test_nosql": ["unit/nosql.test.ts"],
    "test_obs_multi_az": ["unit/obs.test.ts"],
    "test_page_runtime": ["integration/runtime.test.ts"],
    "test_rating_contract": ["unit/pricing.test.ts"],
    "test_regions_errors": ["unit/regions.test.ts"],
    "test_registry": ["integration/interfaces.test.ts"],
    "test_server_workers": ["integration/mcp-stdio.test.ts"],
    "test_sfs_capacity": ["unit/sfs.test.ts"],
    "test_template_render": ["integration/render.test.ts"],
}
# No TypeScript counterpart yet; the note says where it is planned (tasks.md) or why none is needed.
MISSING: dict[str, str] = {
    "test_audit_page_comparison": "4.1", "test_audit_service_safety": "4.1",
    
    
    "test_form_only": "4.1", "test_forms": "4.1", "test_frontend": "5.2", "test_gate": "4.2",
    "test_live": "live marker, kept out of CI", "test_page": "4.1", "test_page_live": "live marker",
    "test_page_replay": "4.1", "test_public_form_fixtures": "4.1", "test_public_form_live": "live marker",
    "test_quote_file": "4.3b", "test_region_sweep": "4.4", "test_schema": "4.3b",
    "test_schema_invariants": "4.3b", "test_schema_live": "live marker", "test_share_session": "4.2",
    "test_ui": "5.3 (CLI output)", "test_update": "5.2", "test_workflow": "3.1",
}


def main() -> int:
    names = sorted(p.stem for p in (ROOT / "tests").glob("test_*.py"))
    bad = [n for n in names if n not in MAP and n not in MISSING]
    bad += [f"{n} -> {f}" for n, files in MAP.items() for f in files if not (TS / f).exists()]
    for n in names:
        print(f"{n:30} {', '.join(MAP[n]) if n in MAP else 'missing (' + MISSING.get(n, '?') + ')'}")
    covered = sum(n in MAP for n in names)
    print(f"\n{covered}/{len(names)} Python test files have a TypeScript counterpart")
    if bad:
        print("unknown or dangling entries:", *bad, sep="\n  ")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
