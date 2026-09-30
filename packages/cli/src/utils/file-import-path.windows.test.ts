import { strict as assert } from 'assert'
import { mock, test } from 'bun:test'
import { win32 } from 'node:path'

mock.module('path', () => ({ ...win32, default: win32 }))
const { getFileImportRelativePath } = await import('./file-import-path.js')

test('a Windows path imports with forward slashes, so `\\u` is never an escape', () => {
  assert.equal(
    getFileImportRelativePath(
      'D:\\a\\app\\.pikku\\addon\\function\\pikku-functions.gen.ts',
      'D:\\a\\app\\src\\functions\\update-agent.function.ts',
      {}
    ),
    '../../../src/functions/update-agent.function.js'
  )
})

test('a Windows path in the same directory still takes ./', () => {
  assert.equal(
    getFileImportRelativePath(
      'D:\\a\\app\\src\\a.ts',
      'D:\\a\\app\\src\\b.ts',
      {}
    ),
    './b.js'
  )
})

test('a Windows path under a mapped package imports by package name', () => {
  assert.equal(
    getFileImportRelativePath(
      'D:\\a\\app\\backend\\.pikku\\x.gen.ts',
      'D:\\a\\app\\packages\\shared\\src\\types.ts',
      { 'packages/shared': '@app/shared' }
    ),
    '@app/shared/src/types.js'
  )
})
