const { execSync } = require('node:child_process')
const { readdirSync, rmSync } = require('node:fs')
const { join } = require('node:path')

execSync('npx changeset version')
// A `.changeset/release-<version>.json` marker allows the minor changesets of
// one planned release (see scripts/check-changesets-are-patch.mjs). Those
// changesets have just been consumed, so the exception goes with them.
for (const file of readdirSync('.changeset')) {
  if (/^release-\d+\.\d+\.\d+\.json$/.test(file)) {
    rmSync(join('.changeset', file))
  }
}
execSync('node scripts/sync-starter-template-pins.mjs', { stdio: 'inherit' })
execSync('bun install')
