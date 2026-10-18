import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

// Cloudflare Workers refuses to start a worker whose global scope generates
// random values, sets a timer or does I/O, so importing the package must do
// none of them. The import runs in a fresh process with those calls throwing.
test('importing the package generates no random values and sets no timers', () => {
  const entry = fileURLToPath(new URL('./index.ts', import.meta.url))
  const script = `
    const refuse = (name) => () => { throw new Error('global scope called ' + name) }
    globalThis.crypto.randomUUID = refuse('crypto.randomUUID')
    globalThis.crypto.getRandomValues = refuse('crypto.getRandomValues')
    Math.random = refuse('Math.random')
    globalThis.setTimeout = refuse('setTimeout')
    globalThis.setInterval = refuse('setInterval')
    await import(${JSON.stringify(entry)})
  `
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
})
