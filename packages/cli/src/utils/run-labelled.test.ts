import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { runLabelled, stopLabelledRuns } from './run-labelled.js'

test('a character split across two chunks prints whole', async () => {
  const lines: string[] = []
  const result = await runLabelled(
    { logger: { info: (line: string) => lines.push(line) }, label: 'x' },
    process.execPath,
    [
      '-e',
      'process.stdout.write(Buffer.from([0x63, 0x61, 0x66, 0xc3])); setTimeout(() => process.stdout.write(Buffer.from([0xa9, 0x0a])), 100)',
    ],
    { cwd: tmpdir() }
  )
  assert.equal(result.ok, true)
  assert.deepEqual(lines, ['[x] café'])
})

test('stopping kills the running commands and refuses new ones', async () => {
  const logger = { info: () => {} }
  const run = runLabelled(
    { logger, label: 'x' },
    'sh',
    ['-c', 'sleep 60; true'],
    { cwd: tmpdir(), group: true }
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  const resume = stopLabelledRuns()
  try {
    assert.equal((await run).failure, 'killed by SIGTERM')
    const next = await runLabelled(
      { logger, label: 'y' },
      process.execPath,
      ['-e', ''],
      { cwd: tmpdir() }
    )
    assert.equal(next.failure, 'interrupted')
  } finally {
    resume()
  }
})
