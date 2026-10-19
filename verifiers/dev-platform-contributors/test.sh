#!/bin/bash
set -e

echo "=== Dev Platform Contributors Verifier ==="
echo "--- a project that opts in to nothing generates no contributors file ---"
rm -rf .pikku
npx pikku
if [ -e .pikku/contributors/pikku-dev-contributors.gen.ts ]; then
  echo "✗ a contributors file was generated for a project that opted in to none"
  exit 1
fi
npx tsc -b
echo "✓ no contributors, no generated file"
echo "--- opted-in contributors: dev and deploy variants across addons ---"
for addon in contrib-notify contrib-select contrib-bad; do
  (cd "$addon" && npx pikku all >/dev/null)
  test -f "$addon/.pikku/addon/contributors/pikku-contributors-meta.gen.json"
done
for scenario in multi pg sqlite lifecycle; do
  rm -rf "scenarios/$scenario/.pikku"
  (cd "scenarios/$scenario" && npx pikku all >/dev/null)
  test -f "scenarios/$scenario/.pikku/contributors/pikku-dev-contributors.gen.ts"
done
(cd scenarios/multi && npx tsc --noEmit -p .)
npx tsx src/check-contributors.ts

echo "--- real pikku dev / pikku serve processes: contributor hooks around the app lifecycle ---"
(cd scenarios/lifecycle && npx tsc --noEmit -p .)
npx tsx src/check-lifecycle.ts

echo "--- the generated file is removed once no contributors remain ---"
(cd scenarios/multi && npx pikku all -c "$PWD/pikku.off.config.json" >/dev/null)
if [ -e scenarios/multi/.pikku/contributors/pikku-dev-contributors.gen.ts ]; then
  echo "✗ a stale pikku-dev-contributors.gen.ts survived"
  exit 1
fi
echo "✓ stale generated file removed"

expect_failure() { # scenario, message
  rm -rf "scenarios/$1/.pikku"
  if output=$(cd "scenarios/$1" && npx pikku all 2>&1); then
    echo "✗ codegen succeeded for '$1'"
    exit 1
  fi
  if ! grep -q "$2" <<<"$output"; then
    echo "$output"
    echo "✗ '$1' failed without: $2"
    exit 1
  fi
  echo "✓ $1: $2"
}
expect_failure dup "Contributors 'dup-a' and 'dup-b' both provide 'shared'"
expect_failure ghost "Contributor 'needs-ghost' needs 'ghost', which nothing provides"
expect_failure cycle "depend on each other in a cycle: cycle-a -> cycle-b -> cycle-a"
echo "--- removed contributor config is refused, not silently dropped ---"
for section in dev deploy; do
  node -e '
    const fs = require("fs")
    const c = JSON.parse(fs.readFileSync("scenarios/multi/pikku.config.json", "utf8"))
    c[process.argv[1]] = { ...(c[process.argv[1]] ?? {}), contributors: ["./x.ts"] }
    fs.writeFileSync("scenarios/multi/pikku.removed.config.json", JSON.stringify(c))
  ' "$section"
  if output=$(cd scenarios/multi && npx pikku all -c "$PWD/pikku.removed.config.json" 2>&1); then
    rm -f scenarios/multi/pikku.removed.config.json
    echo "✗ codegen accepted $section.contributors"
    exit 1
  fi
  rm -f scenarios/multi/pikku.removed.config.json
  if ! grep -q "$section.contributors is no longer read" <<<"$output" || ! grep -q "docs/contributors.md" <<<"$output"; then
    echo "$output"
    echo "✗ $section.contributors was refused without saying how to migrate"
    exit 1
  fi
  echo "✓ $section.contributors refused by name"
done
echo "--- an addon still declaring pikku.contributors is a PKU364 error ---"
notify_pkg="$(cd contrib-notify && pwd)/package.json"
cp "$notify_pkg" "$notify_pkg.orig"
restore_notify() { mv -f "$notify_pkg.orig" "$notify_pkg" 2>/dev/null || true; }
trap restore_notify EXIT
node -e '
  const fs = require("fs")
  const p = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
  p.pikku = { ...(p.pikku ?? {}), contributors: ["./legacy.js"] }
  fs.writeFileSync(process.argv[1], JSON.stringify(p, null, 2))
' "$notify_pkg"
rm -rf scenarios/multi/.pikku
if output=$(cd scenarios/multi && npx pikku all 2>&1); then
  restore_notify
  echo "✗ codegen accepted an addon with pikku.contributors"
  exit 1
fi
restore_notify
if ! grep -q "PKU364" <<<"$output"; then
  echo "$output"
  echo "✗ pikku.contributors was refused without PKU364"
  exit 1
fi
echo "✓ legacy pikku.contributors: PKU364"
rm -rf scenarios/multi/.pikku
(cd scenarios/multi && npx pikku all >/dev/null)
echo "--- a database on disk that the pikku config does not declare is refused ---"
rm -rf scenarios/pg/.pikku-nodb
if output=$(cd scenarios/pg && npx pikku all -c "$PWD/pikku.nodb.config.json" 2>&1); then
  echo "✗ codegen succeeded although db/postgres exists and the pikku config has no db"
  exit 1
fi
rm -rf scenarios/pg/.pikku-nodb
if ! grep -q "the pikku config has no \`db\`" <<<"$output"; then
  echo "$output"
  echo "✗ codegen failed without naming the missing db"
  exit 1
fi
echo "✓ kysely baseline disagreement fails codegen"
echo "=== All tests passed ==="
