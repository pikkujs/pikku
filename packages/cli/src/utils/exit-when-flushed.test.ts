import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const helper = fileURLToPath(new URL('./exit-when-flushed.ts', import.meta.url))

describe('exitWhenFlushed', () => {
  test('a 300 KB write through a shell pipe arrives whole', () => {
    const script = join(mkdtempSync(join(tmpdir(), 'pikku-exit-')), 'out.mjs')
    writeFileSync(
      script,
      `import { exitWhenFlushed } from ${JSON.stringify(helper)}
console.log('x'.repeat(300_000))
exitWhenFlushed(0)`
    )
    const result = spawnSync('sh', ['-c', `node "${script}" | wc -c`], {
      encoding: 'utf8',
    })
    assert.equal(Number(result.stdout.trim()), 300_001)
  })
})
