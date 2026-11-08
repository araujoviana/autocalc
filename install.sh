#!/bin/sh
# Install autocalc from the newest release tag (ADR-0019). AUTOCALC_REF pins another ref.
set -eu

REPO="${AUTOCALC_REPO:-https://github.com/araujoviana/autocalc.git}"
die() { echo "autocalc install: $*" >&2; exit 1; }

if ! command -v bun >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || die "curl is required to install bun."
  curl -fsSL https://bun.sh/install | bash || die "could not install bun."
  PATH="$HOME/.bun/bin:$PATH"
fi

bun_bin="${BUN_INSTALL:-$HOME/.bun}/bin"
mkdir -p "$bun_bin"
rm -f "$bun_bin/autocalc" "$bun_bin/autocalc-mcp"

is_local=0
if [ "${1:-}" = "--local" ] || [ "${1:-}" = "-l" ]; then
  is_local=1
elif [ -z "${AUTOCALC_REF:-}" ] && [ -f "./package.json" ] && grep -q '"name": "autocalc"' "./package.json" 2>/dev/null; then
  is_local=1
fi

if [ "$is_local" -eq 1 ]; then
  bun install || die "could not install local dependencies."
  bun add -g --force . || die "bun could not install local package."
  ver=$(grep '"version"' ./package.json 2>/dev/null | head -n1 | sed -E 's/.*"version": "([^"]+)".*/\1/' || true)
  ref="local${ver:+ (v$ver)}"
else
  command -v git >/dev/null 2>&1 || die "git is required."
  ref="${AUTOCALC_REF:-}"
  if [ -z "$ref" ]; then
    ref=$(git ls-remote --tags --refs "$REPO" 'v*' 2>/dev/null | sed 's|.*refs/tags/||' \
      | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -t. -k1.2,1n -k2,2n -k3,3n | tail -n 1 || true)
    if [ -z "$ref" ]; then
      ref="main"
    fi
  fi
  bun add -g --force "git+$REPO#$ref" || die "bun could not install $ref."
fi

# Ensure commands are available in ~/.local/bin if in PATH
if [ -d "$HOME/.local/bin" ] && echo ":$PATH:" | grep -q ":$HOME/.local/bin:"; then
  ln -sf "$bun_bin/autocalc" "$HOME/.local/bin/autocalc" 2>/dev/null || true
  ln -sf "$bun_bin/autocalc-mcp" "$HOME/.local/bin/autocalc-mcp" 2>/dev/null || true
fi

if command -v claude >/dev/null 2>&1; then
  mcp_out=$(claude mcp add hwc-calculator -- autocalc-mcp 2>&1 || true)
  if echo "$mcp_out" | grep -qi "already exists"; then
    :
  elif [ -n "$mcp_out" ]; then
    echo "$mcp_out"
  fi
else
  echo "To use it from an agent: claude mcp add hwc-calculator -- autocalc-mcp"
fi

echo "Installed autocalc $ref. Next: autocalc doctor, then autocalc login."
echo "If 'autocalc' is not found, open a new shell (bun puts it in $bun_bin)."
