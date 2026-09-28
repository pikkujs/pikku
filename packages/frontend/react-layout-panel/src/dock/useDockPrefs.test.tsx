import { describe, test, afterEach } from 'node:test'
import assert from 'node:assert/strict'

import { defaultDockSide } from './useDockPrefs.js'

const withDocumentDir = (dir: string | undefined) => {
  const g = globalThis as { document?: unknown }
  if (dir === undefined) {
    delete g.document
    return
  }
  g.document = { documentElement: { dir } }
}

afterEach(() => withDocumentDir(undefined))

describe('defaultDockSide', () => {
  test('an RTL page starts the dock on the right', () => {
    withDocumentDir('rtl')
    assert.equal(defaultDockSide(), 'right')
  })

  test('an LTR page starts the dock on the left', () => {
    withDocumentDir('ltr')
    assert.equal(defaultDockSide(), 'left')
  })

  test('a page that never set dir starts on the left', () => {
    withDocumentDir('')
    assert.equal(defaultDockSide(), 'left')
  })

  test('rendering without a document does not throw', () => {
    withDocumentDir(undefined)
    assert.equal(defaultDockSide(), 'left')
  })
})
