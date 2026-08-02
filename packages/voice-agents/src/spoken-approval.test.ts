import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import {
  interpretConsent,
  spokenApproval,
  spokenApprovals,
} from './spoken-approval.js'

const approval = (reason?: string) => ({
  toolCallId: 'call-1',
  toolName: 'todos__deleteTodo',
  reason,
})

describe('spokenApproval', () => {
  test('speaks the function’s wording verbatim', () => {
    const reason = 'Delete the todo called "Buy milk"'
    const spoken = spokenApproval(approval(reason))

    // The whole point: the sanctioned sentence survives intact.
    assert.ok(spoken.text.startsWith(reason))
    assert.equal(spoken.text, `${reason}. Is that okay?`)
    assert.equal(spoken.undescribed, false)
  })

  test('does not double up punctuation the description already has', () => {
    const spoken = spokenApproval(approval('Delete every completed todo?'))
    assert.equal(spoken.text, 'Delete every completed todo? Is that okay?')
  })

  test('admits it cannot describe a tool that gave no description', () => {
    const spoken = spokenApproval(approval(undefined))

    assert.equal(spoken.undescribed, true)
    assert.match(spoken.text, /todos__deleteTodo/)
    // It must not invent a description of the effect from the tool name.
    assert.doesNotMatch(spoken.text, /delete the/i)
  })

  test('treats a whitespace-only description as no description at all', () => {
    assert.equal(spokenApproval(approval('   ')).undescribed, true)
  })

  test('keeps one utterance per call rather than merging them', () => {
    const spoken = spokenApprovals([
      { toolCallId: 'a', toolName: 'add', reason: 'Add a todo called "Milk"' },
      { toolCallId: 'b', toolName: 'del', reason: 'Delete the todo "Bread"' },
    ])

    assert.equal(spoken.length, 2)
    assert.equal(spoken[0]!.toolCallId, 'a')
    assert.equal(spoken[1]!.toolCallId, 'b')
  })
})

describe('interpretConsent', () => {
  for (const answer of [
    'yes',
    'Yeah, go ahead',
    'sure',
    'ok',
    'okay do it',
    'yep, please do',
    'no problem',
    'that works',
  ]) {
    test(`grants on "${answer}"`, () => {
      assert.equal(interpretConsent(answer), 'granted')
    })
  }

  for (const answer of [
    'no',
    'nope',
    "don't",
    'do not do that',
    'stop',
    'cancel that',
    'never mind',
    'wait',
  ]) {
    test(`denies on "${answer}"`, () => {
      assert.equal(interpretConsent(answer), 'denied')
    })
  }

  test('is unclear when the answer holds both', () => {
    // Asking again costs a sentence. Guessing costs the delete.
    assert.equal(interpretConsent('yes — no, wait'), 'unclear')
  })

  test('is unclear on silence or an unrelated answer', () => {
    assert.equal(interpretConsent(''), 'unclear')
    assert.equal(interpretConsent('   '), 'unclear')
    assert.equal(interpretConsent('what was the second one again'), 'unclear')
  })

  test('does not read consent out of a word that merely contains one', () => {
    assert.equal(interpretConsent('the note said yesterday'), 'unclear')
    assert.equal(interpretConsent('add nostalgia to the list'), 'unclear')
  })
})
