import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { LARGE_CHANGESET, needsPlan, type PlanJudge } from './plan-judge.js'

const change = { title: 'Rename the button', body: null }
const base = { title: 'Copy', changes: [change], reads: [], creates: [], alters: [] }
const answers = (needs: boolean): PlanJudge => ({
  judge: async () => ({ needsPlan: needs, why: 'judged' }),
})
const broken: PlanJudge = {
  judge: async () => {
    throw new Error('down')
  },
}

describe('needsPlan', () => {
  test('a table created or altered is planned without asking the judge', async () => {
    assert.equal(
      (await needsPlan({ ...base, alters: ['entry'] }, broken)).needsPlan,
      true
    )
  })

  test('a large changeset is planned without asking the judge', async () => {
    const changes = Array.from({ length: LARGE_CHANGESET }, () => change)
    assert.equal(
      (await needsPlan({ ...base, changes }, answers(false))).needsPlan,
      true
    )
  })

  test('the grey zone is the judge’s call', async () => {
    assert.equal((await needsPlan(base, answers(false))).needsPlan, false)
    assert.equal((await needsPlan(base, answers(true))).needsPlan, true)
  })

  test('a failing judge fails toward a plan', async () => {
    const verdict = await needsPlan(base, broken)
    assert.equal(verdict.needsPlan, true)
    assert.match(verdict.why, /down/)
  })

  test('with no judge only the fixed rules decide', async () => {
    assert.equal((await needsPlan(base, null)).needsPlan, false)
  })
})
