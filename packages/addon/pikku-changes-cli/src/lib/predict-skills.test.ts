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

test('copy work predicts nothing', () => {
  assert.deepEqual(predictSkills(['Reword the welcome text']), [])
})

test('work with files brings the content skill', () => {
  for (const text of [
    'Let customers upload a photo',
    'Attach a PDF to each invoice',
    'Keep the signed document',
  ]) {
    assert.deepEqual(predictSkills([text]), ['pikku-content'])
  }
})
