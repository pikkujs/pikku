import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MANTINE_BLOCKS,
  blockTags,
  findBlock,
  listBlocks,
  resolveBlock,
} from './index.js'

test('every block calls only the i18n keys it ships', () => {
  for (const block of MANTINE_BLOCKS) {
    const keys = new Set(Object.keys(resolveBlock(block.name)!.i18nKeys))
    for (const content of Object.values(block.source)) {
      const code = content.replace(/^\s*\/\/.*$/gm, '')
      for (const [, key] of code.matchAll(/\bm\.([a-z0-9_]+)\(/g)) {
        assert.ok(
          keys.has(key!),
          `${block.name} calls m.${key}() without shipping it`
        )
      }
    }
  }
})

test('every dependsOn names a real block', () => {
  for (const block of MANTINE_BLOCKS) {
    for (const dep of block.dependsOn)
      assert.ok(findBlock(dep), `${block.name} → ${dep}`)
  }
})

test('listBlocks hides internal blocks and filters by tag case-insensitively', () => {
  assert.ok(listBlocks().every((b) => !b.internal))
  const tag = blockTags()[0]!
  assert.equal(listBlocks(tag.tag.toUpperCase()).length, tag.count)
  assert.deepEqual(listBlocks('no-such-tag'), [])
})

test('resolveBlock inlines composed blocks, files and keys', () => {
  const composed = MANTINE_BLOCKS.find((b) => b.dependsOn.length > 0)!
  const resolved = resolveBlock(composed.name.toLowerCase())!
  assert.equal(resolved.block.name, composed.name)
  assert.deepEqual(
    resolved.composes.slice(0, composed.dependsOn.length),
    composed.dependsOn
  )
  for (const dep of composed.dependsOn) {
    for (const file of Object.keys(findBlock(dep)!.source))
      assert.ok(file in resolved.files, file)
  }
  assert.equal(resolveBlock('NoSuchBlock'), undefined)
})
