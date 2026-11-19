import { describe, test } from 'node:test'
import assert from 'node:assert'
import { intake } from './next.function.js'

describe('the intake route', () => {
  const { context } = intake('A recipe box where I keep my recipes')

  test('files the whole request with --plan', () => {
    assert.match(context!, /pikku changes file --plan artifacts\/plan\.json/)
    assert.match(context!, /mock: true/)
  })

  test('never tells the intake agent to ask', () => {
    assert.doesNotMatch(context!, /pikku changes ask/)
  })
})
