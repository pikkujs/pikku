import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { streamMetaChanges } from './stream-meta-changes.function.js'

test('pushes one change per regeneration and stops when the client goes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-meta-'))
  const sent: unknown[] = []
  const channel = { state: 'open', send: (data: unknown) => sent.push(data) }
  const running = (streamMetaChanges.func as any)(
    { metaService: { basePath: dir } },
    null,
    { channel }
  )
  await new Promise((r) => setTimeout(r, 100))
  writeFileSync(join(dir, 'pikku-http-wirings-meta.gen.json'), '{}')
  writeFileSync(join(dir, 'pikku-functions-meta.gen.json'), '{}')
  writeFileSync(join(dir, 'notes.ts'), '')
  await new Promise((r) => setTimeout(r, 600))
  assert.deepEqual(sent, [{ pikkuMeta: 'changed' }])
  channel.state = 'closed'
  await running
})
