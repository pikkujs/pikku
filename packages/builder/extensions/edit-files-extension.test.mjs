import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import register from './edit-files-extension.mjs'

function project(files) {
  const dir = mkdtempSync(join(tmpdir(), 'edit-files-'))
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), body)
  }
  return dir
}

function load() {
  let tool
  register({ registerTool: (t) => (tool = t), on: () => {} })
  return tool
}

const edit = async (dir, edits) => load().execute('id', { edits }, null, null, { cwd: dir })
const read = (dir, p) => readFileSync(join(dir, p), 'utf8')

const FILE = `const a = 1
const b = 2
const c = 3
`

test('applies several edits to one file against the text as it was at call time', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'const a = 1', new: 'const a = 10' },
    { path: 'x.ts', old: 'const c = 3', new: 'const c = 30' },
  ])
  assert.equal(res.isError, false)
  assert.equal(read(dir, 'x.ts'), 'const a = 10\nconst b = 2\nconst c = 30\n')
})

// The `edits[N] could not be found` family: with the builtin, edit #1 rewrites the file and
// edit #2's anchor — taken from the same pre-edit text — no longer matches.
test('an earlier edit does not invalidate a later one in the same call', async () => {
  const dir = project({ 'x.ts': 'const a = 1\nconst a2 = 1\n' })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'const a = 1\n', new: 'const a = 1\nconst inserted = 0\n' },
    { path: 'x.ts', old: 'const a2 = 1', new: 'const a2 = 2' },
  ])
  assert.equal(res.isError, false)
  assert.match(read(dir, 'x.ts'), /const inserted = 0/)
  assert.match(read(dir, 'x.ts'), /const a2 = 2/)
})

test('matches an anchor whose whitespace the formatter changed', async () => {
  const dir = project({ 'x.ts': 'const fn = (a, b) => {\n  return a + b\n}\n' })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'const fn = (a,b) => { return a + b }', new: 'const fn = () => 0' },
  ])
  assert.equal(res.isError, false)
  assert.equal(read(dir, 'x.ts'), 'const fn = () => 0\n')
  assert.match(res.content[0].text, /ignoring whitespace/)
})

test('refuses a non-unique anchor rather than editing the wrong one', async () => {
  const dir = project({ 'x.ts': 'x()\nx()\n' })
  const res = await edit(dir, [{ path: 'x.ts', old: 'x()', new: 'y()' }])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /matched 2 places/)
  assert.equal(read(dir, 'x.ts'), 'x()\nx()\n')
})

test('replace_all takes every occurrence', async () => {
  const dir = project({ 'x.ts': 'x()\nx()\n' })
  const res = await edit(dir, [{ path: 'x.ts', old: 'x()', new: 'y()', replace_all: true }])
  assert.equal(res.isError, false)
  assert.equal(read(dir, 'x.ts'), 'y()\ny()\n')
})

// The whole point: a miss must be fixable in the SAME turn, without a re-read.
test('a miss reports the closest text currently in the file', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [{ path: 'x.ts', old: 'const b = 99', new: 'const b = 5' }])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /Closest text in the file right now/)
  assert.match(res.content[0].text, /const b = 2/)
})

test('one failed edit leaves its whole file untouched', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'const a = 1', new: 'const a = 10' },
    { path: 'x.ts', old: 'nope', new: 'never' },
  ])
  assert.equal(res.isError, true)
  assert.equal(read(dir, 'x.ts'), FILE)
})

test('a failure in one file does not stop a different file being edited', async () => {
  const dir = project({ 'x.ts': FILE, 'y.ts': FILE })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'nope', new: 'never' },
    { path: 'y.ts', old: 'const a = 1', new: 'const a = 10' },
  ])
  assert.equal(res.isError, false)
  assert.equal(read(dir, 'x.ts'), FILE)
  assert.match(read(dir, 'y.ts'), /const a = 10/)
})

test('overlapping edits are refused instead of silently corrupting the file', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [
    { path: 'x.ts', old: 'const a = 1\nconst b = 2', new: 'merged' },
    { path: 'x.ts', old: 'const b = 2', new: 'other' },
  ])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /overlapping/)
  assert.equal(read(dir, 'x.ts'), FILE)
})

test('a missing file fails that entry and says so', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [{ path: 'gone.ts', old: 'a', new: 'b' }])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /gone\.ts/)
})

test('an edit whose old and new are identical is refused, not reported as an edit', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [{ path: 'x.ts', old: 'const a = 1', new: 'const a = 1' }])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /IDENTICAL/)
  assert.equal(read(dir, 'x.ts'), FILE)
})

test('a truncated edit names the field it lost instead of failing the whole call', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [{ path: 'x.ts', old: 'const a = 1' }])
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /missing `new`/)
  assert.equal(read(dir, 'x.ts'), FILE)
})

test('a truncated edit does not cost the rest of its batch', async () => {
  const dir = project({ 'x.ts': FILE, 'y.ts': FILE })
  const res = await edit(dir, [
    { path: 'y.ts', old: 'const a = 1', new: 'const a = 10' },
    { path: 'x.ts', old: 'const b = 2' },
  ])
  assert.match(read(dir, 'y.ts'), /const a = 10/)
  assert.match(res.content[0].text, /missing `new`/)
})

test('an empty batch is answered with a way out, not a bare rejection', async () => {
  const dir = project({ 'x.ts': FILE })
  const res = await edit(dir, [])
  assert.match(res.content[0].text, /empty `edits` array is never the way out/)
})
