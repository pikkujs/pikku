import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

describe('serializeWorkflowRoutes', () => {
  test('generates deterministic init event for both stream variants', () => {
    const result = serializeWorkflowRoutes('#pikku', true)

    const initMatches = result.match(/type: 'init'/g) ?? []
    assert.equal(initMatches.length, 2)
    assert.match(result, /if \(!initSent && run\.deterministic\)/)
    assert.match(result, /steps: \(run\.plannedSteps \?\? \[\]\)\.map/)
    assert.match(result, /status: statusByStep\.get\(s\.stepName\) \?\? 'pending'/)
  })

  test('keeps update and done events in both streams', () => {
    const result = serializeWorkflowRoutes('#pikku', true)

    const updateMatches = result.match(/type: 'update'/g) ?? []
    const doneMatches = result.match(/type: 'done'/g) ?? []

    assert.equal(updateMatches.length, 2)
    assert.equal(doneMatches.length, 2)
  })

  test('renders auth flag correctly', () => {
    const authEnabled = serializeWorkflowRoutes('#pikku', true)
    const authDisabled = serializeWorkflowRoutes('#pikku', false)

    assert.match(authEnabled, /auth: true/)
    assert.match(authDisabled, /auth: false/)
  })
})
