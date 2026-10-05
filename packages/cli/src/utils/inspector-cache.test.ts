import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  inspectorFingerprint,
  readInspectorCache,
  writeInspectorCache,
} from './inspector-cache.js'

const project = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'pikku-inspector-cache-'))
  const source = path.join(root, 'a.function.ts')
  writeFileSync(source, 'export const a = 1\n')
  const outDir = path.join(root, '.pikku')
  return { root, source, outDir }
}

const save = ({ root, source, outDir }: ReturnType<typeof project>) =>
  writeInspectorCache(outDir, {
    fingerprint: inspectorFingerprint(root, [source], [source]),
    inspected: [source],
    state: { saved: true },
  })

test('an unchanged project reads back the saved state', async () => {
  const p = project()
  await save(p)
  const cache = await readInspectorCache(p.outDir, p.root, [p.source])
  assert.deepEqual(cache?.state, { saved: true })
})

test('an edited source is a miss', async () => {
  const p = project()
  await save(p)
  utimesSync(p.source, new Date(), new Date(Date.now() + 5000))
  assert.equal(
    await readInspectorCache(p.outDir, p.root, [p.source]),
    undefined
  )
})

test('a new source file is a miss', async () => {
  const p = project()
  await save(p)
  const added = path.join(p.root, 'b.function.ts')
  writeFileSync(added, 'export const b = 1\n')
  assert.equal(
    await readInspectorCache(p.outDir, p.root, [p.source, added]),
    undefined
  )
})

test('a changed project config is a miss', async () => {
  const p = project()
  await save(p)
  writeFileSync(path.join(p.root, 'pikku.config.json'), '{}\n')
  assert.equal(
    await readInspectorCache(p.outDir, p.root, [p.source]),
    undefined
  )
})

test('no cache is a miss, not an error', async () => {
  const p = project()
  assert.equal(
    await readInspectorCache(p.outDir, p.root, [p.source]),
    undefined
  )
})
