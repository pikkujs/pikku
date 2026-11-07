import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { runLabelled } from './run-labelled.js'

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
