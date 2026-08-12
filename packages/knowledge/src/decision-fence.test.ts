import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { decisionFences, parseDecisionFence } from './decision-fence.js'

describe('parseDecisionFence', () => {
  test('reads the three parts', () => {
    assert.deepEqual(
      parseDecisionFence(
        [
          'chosen: A revoked grant stops working immediately.',
          'rules-out: A "revoked but valid until midnight" state.',
          'because: Two people disagreeing about today is worse.',
        ].join('\n')
      ),
      {
        chosen: 'A revoked grant stops working immediately.',
        rulesOut: ['A "revoked but valid until midnight" state.'],
        because: 'Two people disagreeing about today is worse.',
      }
    )
  })

  test('reads rules-out as a block list', () => {
    const decision = parseDecisionFence(
      'chosen: One account is one person.\nrules-out:\n  - Shared logins\n  - A seat that changes hands'
    )
    assert.deepEqual(decision?.rulesOut, [
      'Shared logins',
      'A seat that changes hands',
    ])
  })

  test('is null without a chosen', () => {
    assert.equal(parseDecisionFence('because: it was cheaper'), null)
  })
})

describe('decisionFences', () => {
  const fence = (body: string) => '```decision\n' + body + '\n```'

  test('finds a fence among prose', () => {
    const found = decisionFences(
      `# Revocation\n\nSome prose.\n\n${fence('chosen: Immediately\nrules-out: A grace period')}\n\nMore prose.`
    )
    assert.equal(found.length, 1)
    assert.equal(found[0]!.decision?.chosen, 'Immediately')
    assert.deepEqual(found[0]!.decision?.rulesOut, ['A grace period'])
  })

  test('finds every fence in a note', () => {
    const found = decisionFences(
      `${fence('chosen: A')}\n\ntext\n\n${fence('chosen: B')}`
    )
    assert.deepEqual(
      found.map((f) => f.decision?.chosen),
      ['A', 'B']
    )
  })

  test('reports an unparsed fence rather than skipping it', () => {
    const found = decisionFences(fence('we picked postgres'))
    assert.equal(found.length, 1)
    assert.equal(found[0]!.decision, null)
    assert.match(found[0]!.source, /postgres/)
  })

  test('ignores fences of other languages', () => {
    const found = decisionFences(
      '```gherkin\nGiven a thing\n```\n\n```\nplain\n```'
    )
    assert.deepEqual(found, [])
  })

  test('is not fooled by the word decision in prose', () => {
    assert.deepEqual(decisionFences('We made a decision: chosen: A'), [])
  })
})
