import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

describe('serializeWorkflowRoutes', () => {
  test('generates deterministic init event for both stream variants', () => {
    const { functions: result } = serializeWorkflowRoutes('#pikku', true)

    const initMatches = result.match(/type: 'init'/g) ?? []
    assert.equal(initMatches.length, 2)
    assert.match(result, /if \(!initSent && run\.deterministic\)/)
    assert.match(result, /steps: \(run\.plannedSteps \?\? \[\]\)\.map/)
    assert.match(
      result,
      /status: statusByStep\.get\(s\.stepName\) \?\? 'pending'/
    )
  })

  test('keeps update and done events in both streams', () => {
    const { functions: result } = serializeWorkflowRoutes('#pikku', true)

    const updateMatches = result.match(/type: 'update'/g) ?? []
    const doneMatches = result.match(/type: 'done'/g) ?? []

    assert.equal(updateMatches.length, 2)
    assert.equal(doneMatches.length, 2)
  })

  test('renders auth flag correctly', () => {
    const { functions: authEnabled } = serializeWorkflowRoutes('#pikku', true)
    const { functions: authDisabled } = serializeWorkflowRoutes('#pikku', false)

    assert.match(authEnabled, /auth: true/)
    assert.match(authDisabled, /auth: false/)
  })

  test('emits an approve route wired to approveStep', () => {
    const { functions: result } = serializeWorkflowRoutes('#pikku', true)

    assert.match(result, /route: '\/workflow\/:workflowName\/approve\/:runId'/)
    assert.match(result, /func: workflowApprover/)
    assert.match(
      result,
      /await workflowService\.approveStep\(runId, reason, decision\)/
    )
  })

  test('the approver destructures workflowService so the analyzer grants workflow-state', () => {
    const { functions: result } = serializeWorkflowRoutes('#pikku', true)

    // Mirrors workflowStarter/graphStarter: the analyzer infers the
    // workflow-state capability from this destructure, so losing it silently
    // strips the route's access rather than failing the build.
    assert.match(
      result,
      /func: async \(\{ workflowService \}, \{ runId, reason, decision \}\)/
    )
  })

  test('takes every payload from the sibling zod module, never a generic', () => {
    const { schemas, functions } = serializeWorkflowRoutes('#pikku', true)

    assert.match(schemas, /import \{ z \} from 'zod'/)
    assert.match(schemas, /export const WorkflowStart = z\.object\(\{/)
    assert.match(functions, /from '\.\/workflow-routes\.schemas\.gen\.js'/)
    assert.match(functions, /input: WorkflowStart/)
    assert.ok(
      !functions.includes('pikkuSessionlessFunc<'),
      'schemas and generics are mutually exclusive'
    )
  })

  test('leaves the run status to the handler rather than re-declaring a core type', () => {
    const { schemas, functions } = serializeWorkflowRoutes('#pikku', true)

    assert.ok(
      !schemas.includes('WorkflowRunStatus'),
      're-declaring a core type in zod would be a second definition free to drift'
    )
    assert.ok(
      /input: WorkflowRunRef,\n  func:/.test(functions),
      'the status checker carries an input schema and no output schema'
    )
  })

  test('keeps the schemas module free of anything but zod', () => {
    const { schemas } = serializeWorkflowRoutes('#pikku', true)

    assert.ok(!schemas.includes('#pikku'))
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
