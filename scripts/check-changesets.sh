#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-origin/main}"

# Get packages covered by changesets
CHANGESET_PACKAGES=$(node -e "
const fs = require('fs');
const path = require('path');
const dir = '.changeset';
const packages = new Set();
for (const file of fs.readdirSync(dir)) {
  if (!file.endsWith('.md') || file === 'README.md') continue;
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) continue;
  for (const line of match[1].split('\n')) {
    const pkg = line.replace(/[\"':]/g, '').replace(/\s*(patch|minor|major)\s*$/, '').trim();
    if (pkg) packages.add(pkg);
  }
}
console.log([...packages].join('\n'));
")

# Get packages with changed files vs base branch
CHANGED_PACKAGES=$(node -e "
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = execSync('git diff ${BASE_BRANCH} --name-only', { encoding: 'utf8' }).trim().split('\n');

const packageDirs = new Set();
for (const file of files) {
  let dir = path.dirname(file);
  while (dir && dir !== '.') {
    const pkgJson = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      packageDirs.add(dir);
      break;
    }
    dir = path.dirname(dir);
  }
}

for (const dir of packageDirs) {
  const pkgJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const skipDirs = ['e2e', 'templates', 'verifiers'];
  if (pkgJson.name && !skipDirs.some(p => dir === p || dir.startsWith(p + '/'))) console.log(pkgJson.name);
}
")

MISSING=()
while IFS= read -r pkg; do
  [ -z "$pkg" ] && continue
  if ! echo "$CHANGESET_PACKAGES" | grep -qxF "$pkg"; then
    MISSING+=("$pkg")
  fi
done <<< "$CHANGED_PACKAGES"

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "❌ The following packages have changes but no changeset:"
  for pkg in "${MISSING[@]}"; do
    echo "  - $pkg"
  done
  echo ""
  echo "Run 'yarn changeset' to add one, or create a .changeset/*.md file manually."
  exit 1
fi

echo "✅ All changed packages have changesets."
