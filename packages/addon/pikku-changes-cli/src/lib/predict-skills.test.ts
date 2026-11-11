import assert from 'node:assert/strict'
import { test } from 'node:test'
import { predictSkills } from './predict-skills.js'

test('a change names the skills its kind of work needs', () => {
  assert.deepEqual(
    predictSkills([
      'Only admins can delete an entry',
      'Email me a weekly summary',
    ]),
    ['pikku-permissions', 'pikku-emails']
  )
})

test('a planned schema changeset brings the architect and the database skill', () => {
  assert.deepEqual(
    predictSkills(['Waitlist'], [{ creates: ['waitlist'], needsPlan: true }]),
    ['pikku-architect', 'pikku-kysely']
  )
})

test('owner words for measuring and switching bring their skills', () => {
  assert.deepEqual(predictSkills(['How many people finish checkout']), [
    'pikku-analytics',
  ])
  assert.deepEqual(predictSkills(['Turn off the assistant for now']), [
    'pikku-agent',
    'pikku-flags',
  ])
})

test('copy work predicts nothing', () => {
  assert.deepEqual(predictSkills(['Reword the welcome text']), [])
})

test('work with files brings the content skill', () => {
  for (const text of [
    'Let customers upload a photo',
    'Attach a PDF to each invoice',
    'Keep the signed document',
    'Show each customer an avatar',
    'Keep every receipt',
    'Send a download link',
  ]) {
    assert.deepEqual(predictSkills([text]), ['pikku-content'])
  }
})

test('the verb document alone does not bring the content skill', () => {
  assert.deepEqual(predictSkills(['Document how the API works']), [])
})
