import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT = join(here, 'check-no-publish-time-cli-rebuild.mjs')
const SCRATCH = join(here, '..', '.tmp')

const run = (scripts) => {
  mkdirSync(SCRATCH, { recursive: true })
  const root = mkdtempSync(join(SCRATCH, 'publish-rebuild-'))
  try {
    const dir = join(root, 'packages', 'pkg')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: '@pikku/pkg', scripts })
    )
    return spawnSync('node', [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, PIKKU_GUARD_ROOT: root },
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('a prepublishOnly that runs `bun run build` into pikku all is refused', () => {
  const result = run({
    build: 'bun run clean && pikku all && tsc -b',
    prepublishOnly: 'bun run build',
  })
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stderr, /"prepublishOnly" rebuilds via the workspace/)
})

test('a prepublishOnly that only compiles is accepted', () => {
  const result = run({
    build: 'bun run clean && tsc -b',
    prepublishOnly: 'bun run build',
  })
  assert.equal(result.status, 0, result.stderr)
})
