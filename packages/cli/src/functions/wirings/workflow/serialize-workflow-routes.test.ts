import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

const leaf = (name: string) => `#pikku/${name}`

describe('serializeWorkflowRoutes', () => {
  test('both stream variants are the same core poller, told how much to say', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    const delegations = result.match(/await streamWorkflowRunStatus\(/g) ?? []
    assert.equal(delegations.length, 2)
    const detailed = result.match(/detailed: true/g) ?? []
    assert.equal(
      detailed.length,
      1,
      'only the full stream asks for output, error and child run ids'
    )
  })

  // The frames themselves are core's, tested by running the poller in
  // workflow-status-stream.test.ts. A second copy here could only be a
  // divergent one, since nothing compiles this template string.
  test('the streams keep no copy of the frames they used to build', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    for (const frame of ["type: 'init'", "type: 'update'", "type: 'done'"]) {
      assert.ok(
        !result.includes(frame),
        `expected no inline \`${frame}\` frame`
      )
    }
    assert.ok(!result.includes('setInterval'))
    assert.ok(!result.includes('plannedSteps'))
  })

  test('emits an approve route wired to approveStep', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    assert.match(result, /route: '\/workflow\/:workflowName\/approve\/:runId'/)
    assert.match(result, /func: workflowApprover/)
    assert.match(
      result,
      /await workflowService\.approveStep\(runId, reason, decision, session\)/
    )
  })

  test('every run entrypoint is gated on run ownership', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    assert.match(
      result,
      /assertWorkflowRunOwner,?\n?[^}]*\} from '@pikku\/core\/workflow'/
    )
    const ownershipChecks =
      result.match(/assertWorkflowRunOwner\(run\.wire, session\)/g) ?? []
    assert.equal(
      ownershipChecks.length,
      1,
      'the status checker owns the run itself; both streams hand session to streamWorkflowRunStatus, which owns it there'
    )
    const sessionsPassed =
      result.match(/streamWorkflowRunStatus\(\{[^}]*session/g) ?? []
    assert.equal(
      sessionsPassed.length,
      2,
      'a stream that forgot to pass session would poll an unowned run'
    )
  })

  test('no route lets a caller pick the graph entry node', () => {
    const { schemas, functions } = serializeWorkflowRoutes(leaf)

    assert.ok(
      !functions.includes('startNode'),
      'entry-node choice is internal — a trigger names one, a caller does not'
    )
    assert.ok(!functions.includes('/graph/:nodeId'))
    assert.ok(!schemas.includes('GraphStart'))
  })

  test('the approver destructures workflowService so the analyzer grants workflow-state', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    // Mirrors workflowStarter: the analyzer infers the workflow-state
    // capability from this destructure, so losing it silently strips the
    // route's access rather than failing the build.
    assert.match(
      result,
      /func: async \(\{ workflowService \}, \{ runId, reason, decision \}, \{ session \}\)/
    )
  })

  test('takes every payload from the sibling zod module, never a generic', () => {
    const { schemas, functions } = serializeWorkflowRoutes(leaf)

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
    const { schemas, functions } = serializeWorkflowRoutes(leaf)

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
    const { schemas } = serializeWorkflowRoutes(leaf)

    assert.ok(!schemas.includes(leaf))
    assert.ok(!schemas.includes('@pikku/core'))
  })
})
