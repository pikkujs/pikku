import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyUrlParams, resolveUrlSelection } from './url-state.js'

describe('applyUrlParams', () => {
  it('leaves a param this surface does not own alone', () => {
    const next = applyUrlParams(new URLSearchParams('tab=http&runId=7'), {
      file: 'src/index.ts',
    })
    assert.equal(next.get('runId'), '7')
    assert.equal(next.get('file'), 'src/index.ts')
  })

  it('clears on null and on empty, so one setter can do both', () => {
    const next = applyUrlParams(new URLSearchParams('tab=http&search=user'), {
      tab: null,
      search: '',
    })
    assert.equal(next.get('tab'), null)
    assert.equal(next.get('search'), null)
  })

  it('writes every key in one pass', () => {
    const next = applyUrlParams(new URLSearchParams('tab=http&search=user'), {
      tab: 'channels',
      search: null,
    })
    assert.equal(next.toString(), 'tab=channels')
  })
})

describe('resolveUrlSelection', () => {
  it('keeps a value that names a row', () => {
    assert.equal(resolveUrlSelection('b', ['a', 'b']), 'b')
  })

  it('falls back to the first when the row has gone', () => {
    assert.equal(resolveUrlSelection('gone', ['a', 'b']), 'a')
    assert.equal(resolveUrlSelection(null, ['a', 'b']), 'a')
  })

  it('is null when there is nothing to select', () => {
    assert.equal(resolveUrlSelection('a', []), null)
  })
})
