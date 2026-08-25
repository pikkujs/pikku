import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SERVER_READY_MARKER, serverReadyLine } from './server-ready.js'

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = join(packageDir, '..', '..', '..')

describe('the ready handshake a parent process waits for', () => {
  it('keeps the marker string every existing waiter greps for', () => {
    assert.equal(SERVER_READY_MARKER, 'pikku: ready')
  })

  it('names the port a parent should connect to', () => {
    assert.equal(
      serverReadyLine('127.0.0.1', 51234),
      'pikku: ready on http://127.0.0.1:51234'
    )
  })

  it('is declared once, and re-exported rather than copied by the CLI', () => {
    const cliServerReady = readFileSync(
      join(repoRoot, 'packages', 'cli', 'src', 'server', 'server-ready.ts'),
      'utf-8'
    )
    assert.ok(
      cliServerReady.includes("from '@pikku/deploy'"),
      'the CLI must re-export the marker, not keep a second copy that can drift'
    )
    assert.ok(
      !/SERVER_READY_MARKER\s*=/.test(cliServerReady),
      'the CLI must not assign its own SERVER_READY_MARKER'
    )
  })
})
