#!/bin/sh
# Install autocalc from the newest release tag (ADR-0013). AUTOCALC_REF pins another ref.
set -eu

REPO="${AUTOCALC_REPO:-https://github.com/araujoviana/autocalc.git}"
die() { echo "autocalc install: $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required."
ref="${AUTOCALC_REF:-}"
if [ -z "$ref" ]; then
  ref=$(git ls-remote --tags --refs "$REPO" 'v*' | sed 's|.*refs/tags/||' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n 1 || true)
  [ -n "$ref" ] || die "no release tag (vX.Y.Z) found in $REPO. Set AUTOCALC_REF to install another ref."
fi

if ! command -v uv >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || die "curl is required to install uv."
  curl -LsSf https://astral.sh/uv/install.sh | sh || die "could not install uv."
  PATH="$HOME/.local/bin:$PATH"
fi

uv tool install --force "git+$REPO@$ref" || die "uv could not install $ref."

if command -v claude >/dev/null 2>&1; then
  claude mcp add hwc-calculator -- autocalc-mcp || echo "Could not register the MCP server; run: claude mcp add hwc-calculator -- autocalc-mcp"
else
  echo "To use it from an agent: claude mcp add hwc-calculator -- autocalc-mcp"
fi

echo "Installed autocalc $ref. Next: autocalc doctor, then autocalc login."
echo "If 'autocalc' is not found, open a new shell (uv puts it in $(uv tool dir --bin))."
