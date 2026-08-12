import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { parseDecisionFence } from './decisionFence.js'

describe('parseDecisionFence', () => {
  test('reads the three parts', () => {
    const decision = parseDecisionFence(
      [
        'chosen: A revoked grant stops working immediately.',
        'rules-out: A "revoked but valid until midnight" state.',
        'because: Two people disagreeing about who can see today is worse.',
      ].join('\n')
    )

    assert.deepEqual(decision, {
      chosen: 'A revoked grant stops working immediately.',
      rulesOut: ['A "revoked but valid until midnight" state.'],
      because: 'Two people disagreeing about who can see today is worse.',
    })
  })

  test('reads rules-out as a block list', () => {
    const decision = parseDecisionFence(
      [
        'chosen: One account is one person.',
        'rules-out:',
        '  - Shared team logins',
        '  - A seat that changes hands',
      ].join('\n')
    )

    assert.deepEqual(decision?.rulesOut, [
      'Shared team logins',
      'A seat that changes hands',
    ])
  })

  test('accepts the snake and squashed spellings of rules-out', () => {
    for (const key of ['rules_out', 'rulesout', 'RULES-OUT']) {
      const decision = parseDecisionFence(`chosen: A\n${key}: B`)
      assert.deepEqual(decision?.rulesOut, ['B'], key)
    }
  })

  test('a decision may rule out nothing', () => {
    const decision = parseDecisionFence('chosen: Postgres')
    assert.deepEqual(decision, { chosen: 'Postgres', rulesOut: [] })
  })

  test('is null without a chosen, so the fence stays code', () => {
    assert.equal(parseDecisionFence('because: it was cheaper'), null)
    assert.equal(parseDecisionFence('just some prose'), null)
    assert.equal(parseDecisionFence(''), null)
  })

  test('ignores keys it does not know rather than failing', () => {
    const decision = parseDecisionFence(
      'chosen: A\nowner: yasser\nrules-out: B'
    )
    assert.deepEqual(decision, { chosen: 'A', rulesOut: ['B'] })
  })

  test('strips the quotes a YAML habit adds', () => {
    const decision = parseDecisionFence(`chosen: "A"\nbecause: 'B'`)
    assert.equal(decision?.chosen, 'A')
    assert.equal(decision?.because, 'B')
  })

  test('the first spelling of a repeated key wins', () => {
    const decision = parseDecisionFence('chosen: first\nchosen: second')
    assert.equal(decision?.chosen, 'first')
  })
})
