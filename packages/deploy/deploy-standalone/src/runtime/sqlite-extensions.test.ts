import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { materializeEmbeddedFiles } from './sqlite-extensions.js'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pikku-embedded-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Stands in for bun's `/$bunfs/…` copy, which is renamed on the way in. */
const embed = (bytes: string) => {
  const path = join(root, `vec0-${Math.random().toString(36).slice(2)}.bin`)
  writeFileSync(path, bytes)
  return { name: 'vec0.dylib', path }
}

test('each file is written out under its original name', () => {
  const [path] = materializeEmbeddedFiles([embed('v1')], join(root, 'out'))

  assert.equal(basename(path!), 'vec0.dylib')
  assert.equal(readFileSync(path!, 'utf-8'), 'v1')
})

test('a second start reuses the copy rather than rewriting it', () => {
  const file = embed('v1')
  const [first] = materializeEmbeddedFiles([file], join(root, 'out'))
  const [second] = materializeEmbeddedFiles([file], join(root, 'out'))

  assert.equal(first, second)
  assert.deepEqual(
    readdirSync(dirname(first!)),
    ['vec0.dylib'],
    'no partial file left behind'
  )
})

test('a different build lands beside the old one instead of over it', () => {
  const [old] = materializeEmbeddedFiles([embed('v1')], join(root, 'out'))
  const [next] = materializeEmbeddedFiles([embed('v2')], join(root, 'out'))

  assert.notEqual(old, next)
  assert.equal(readFileSync(old!, 'utf-8'), 'v1')
  assert.equal(readFileSync(next!, 'utf-8'), 'v2')
})
