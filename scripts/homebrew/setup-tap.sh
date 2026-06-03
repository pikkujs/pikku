#!/bin/bash
# One-time setup: seeds the pikkujs/homebrew-pikku tap repo.
# Run this after creating the empty repo on GitHub.
#
#   gh repo create pikkujs/homebrew-pikku --public --description "Homebrew tap for Pikku CLI"
#   bash scripts/homebrew/setup-tap.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TAP_REPO="pikkujs/homebrew-pikku"

echo "Cloning $TAP_REPO..."
tmp=$(mktemp -d)
gh repo clone "$TAP_REPO" "$tmp/tap"
cd "$tmp/tap"

mkdir -p Casks
cp "$REPO_ROOT/scripts/homebrew/pikku.rb" Casks/pikku.rb

git add Casks/pikku.rb
git commit -m "feat: add pikku cask (seeded — CI will update on first release)"
git push

echo "Done. Users can now install with:"
echo "  brew tap pikkujs/pikku"
echo "  brew install pikku"
