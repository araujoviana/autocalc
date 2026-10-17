"""Download Huawei's calculator frontend bundle (framework.js) for reverse engineering.

The bundle is third-party code, so it is never committed. This script fetches it on demand
into the gitignored ``.cache/bundle/`` folder and prints the path.

Usage:
    uv run python scripts/fetch_bundle.py                 # current version from calculator.html
    uv run python scripts/fetch_bundle.py --version 11.4.201
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import httpx

CALCULATOR_URL = "https://www.huaweicloud.com/intl/en-us/pricing/calculator.html"
BUNDLE_URL = "https://portal.hc-cdn.com/CBC-PortalCalculator/{version}/framework.js"
VERSION_RE = re.compile(r"CBC-PortalCalculator/([0-9.]+)")  # same pattern `autocalc doctor` uses
OUT_DIR = Path(__file__).resolve().parent.parent / ".cache" / "bundle"


def current_version(client: httpx.Client) -> str:
    html = client.get(CALCULATOR_URL).raise_for_status().text
    m = VERSION_RE.search(html)
    if not m:
        raise SystemExit(f"error: no CBC-PortalCalculator version found in {CALCULATOR_URL}")
    return m.group(1)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Download the calculator frontend bundle into .cache/bundle/.")
    ap.add_argument("--version", help="frontend version to fetch (default: the live one)")
    args = ap.parse_args(argv)
    with httpx.Client(timeout=60, follow_redirects=True) as client:
        version = args.version or current_version(client)
        r = client.get(BUNDLE_URL.format(version=version))
        if r.status_code != 200:
            print(f"error: HTTP {r.status_code} for {r.url} (version {version} may be purged from the CDN)",
                  file=sys.stderr)
            return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"framework-{version}.js"
    out.write_bytes(r.content)
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
