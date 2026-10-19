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
