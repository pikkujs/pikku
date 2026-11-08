import assert from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { packageTool, runScript } from './run-script.js'

const scratch = () => mkdtempSync(join(tmpdir(), 'pikku-run-script-'))

describe('which tool runs a script', () => {
  test('the nearest lockfile wins, an npm one included', () => {
    const root = scratch()
    writeFileSync(join(root, 'pnpm-lock.yaml'), '')
    const nested = join(root, 'apps', 'web')
    mkdirSync(nested, { recursive: true })
    assert.equal(packageTool(nested), 'pnpm')
    writeFileSync(join(nested, 'package-lock.json'), '{}')
    assert.equal(packageTool(nested), 'npm')
  })

  test('npm-shrinkwrap.json counts as an npm lockfile', () => {
    const root = scratch()
    writeFileSync(join(root, 'bun.lock'), '')
    const nested = join(root, 'web')
    mkdirSync(nested)
    writeFileSync(join(nested, 'npm-shrinkwrap.json'), '{}')
    assert.equal(packageTool(nested), 'npm')
  })
})

describe('running a script', () => {
  const frontend = (script: string) => {
    const dir = scratch()
    writeFileSync(join(dir, 'package-lock.json'), '{}')
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ scripts: { build: script } })
    )
    return dir
  }

  test('a timeout stops what the script started, so it does not hold the run', async () => {
    const dir = frontend('sleep 30 & sleep 30')
    const started = Date.now()
    const failure = await runScript(dir, 'build', 1000)
    assert.match(failure ?? '', /SIGKILL/)
    assert.ok(Date.now() - started < 10_000)
  })
})
