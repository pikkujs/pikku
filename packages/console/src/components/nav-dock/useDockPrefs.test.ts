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

  test('an LTR page keeps the bottom dock', () => {
    withDocumentDir('ltr')
    assert.equal(defaultDockSide(), 'bottom')
  })

  test('a page that never set dir keeps the bottom dock', () => {
    withDocumentDir('')
    assert.equal(defaultDockSide(), 'bottom')
  })

  test('rendering without a document does not throw', () => {
    withDocumentDir(undefined)
    assert.equal(defaultDockSide(), 'bottom')
  })
})
