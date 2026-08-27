import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decodePanelHash,
  encodePanelHash,
  panelHashIsBare,
  panelHref,
} from './panel-url.js'

describe('panel url fragments', () => {
  test('a surface with one list writes the bare id', () => {
    assert.equal(panelHashIsBare(new Set(['function'])), true)
    assert.equal(encodePanelHash('function', 'getUser', true), 'getUser')
    assert.deepEqual(decodePanelHash('getUser'), {
      type: null,
      id: 'getUser',
    })
  })

  test('a surface with several lists qualifies the id', () => {
    assert.equal(panelHashIsBare(new Set(['trigger', 'triggerSource'])), false)
    const hash = encodePanelHash('triggerSource', 'orderPlaced', false)
    assert.equal(hash, 'triggerSource:orderPlaced')
    assert.deepEqual(decodePanelHash(hash!), {
      type: 'triggerSource',
      id: 'orderPlaced',
    })
  })

  test('the `::` inside a wire id is not a type separator', () => {
    const id = 'http::GET::/users/:userId'
    const bare = encodePanelHash('http', id, true)
    assert.equal(bare, 'http::GET::/users/:userId')
    assert.deepEqual(decodePanelHash(bare!), { type: null, id })
    const qualified = encodePanelHash('http', id, false)
    assert.deepEqual(decodePanelHash(qualified!), { type: 'http', id })
  })

  test('ids that need escaping round-trip', () => {
    const id = 'send email #2'
    const hash = encodePanelHash('function', id, true)
    assert.equal(hash?.includes('#'), false)
    assert.deepEqual(decodePanelHash(hash!), { type: null, id })
  })

  test('an unknown slug is read as part of a bare id', () => {
    assert.deepEqual(decodePanelHash('nosuchtype:thing'), {
      type: null,
      id: 'nosuchtype:thing',
    })
  })

  test('cross-page links carry the type', () => {
    assert.equal(
      panelHref('channel', 'events'),
      '/apis?tab=channels#channel:events'
    )
    assert.equal(panelHref('workflowStep', 'step-1'), null)
  })
})
