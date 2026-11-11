import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  'check-changesets-published.mjs'
)

const run = (changesets) => {
  const root = mkdtempSync(join(tmpdir(), 'changesets-published-'))
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ workspaces: { packages: ['packages/*'] } })
    )
    const packages = {
      cli: { name: '@pikku/cli' },
      core: { name: '@pikku/core' },
      addon: { name: '@pikku/addon-cloud-cli', private: true },
    }
    for (const [dir, json] of Object.entries(packages)) {
      mkdirSync(join(root, 'packages', dir), { recursive: true })
      writeFileSync(
        join(root, 'packages', dir, 'package.json'),
        JSON.stringify(json)
      )
    }
    mkdirSync(join(root, '.changeset'))
    writeFileSync(join(root, '.changeset', 'README.md'), '# not a changeset')
    for (const [file, names] of Object.entries(changesets)) {
      const body = names.map((name) => `'${name}': patch`).join('\n')
      writeFileSync(join(root, '.changeset', file), `---\n${body}\n---\n\nx\n`)
    }
    return spawnSync('node', [SCRIPT, root], { encoding: 'utf8' })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a changeset naming only published packages passes', () => {
  assert.equal(run({ 'a.md': ['@pikku/cli', '@pikku/core'] }).status, 0)
})

test('a private-only changeset fails, naming the file and the package', () => {
  const result = run({ 'a.md': ['@pikku/addon-cloud-cli'] })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /\.changeset\/a\.md/)
  assert.match(result.stderr, /@pikku\/addon-cloud-cli/)
  assert.match(result.stderr, /name `@pikku\/cli`/)
})

test('a mixed changeset fails too', () => {
  const result = run({ 'a.md': ['@pikku/cli', '@pikku/addon-cloud-cli'] })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /@pikku\/addon-cloud-cli/)
})

test('a name that is no workspace package fails', () => {
  const result = run({ 'a.md': ['@pikku/nope'] })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /@pikku\/nope.*not a workspace package/)
})
