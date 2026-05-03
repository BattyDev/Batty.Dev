#!/bin/sh
# Install Batty.Dev git hooks. Run once after cloning the repo.
set -e

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "error: not inside a git repository" >&2
  exit 1
fi

SRC="$REPO_ROOT/scripts/hooks"
DEST="$REPO_ROOT/.git/hooks"

for hook in "$SRC"/*; do
  name="$(basename "$hook")"
  cp "$hook" "$DEST/$name"
  chmod +x "$DEST/$name"
  echo "installed: $name"
done
