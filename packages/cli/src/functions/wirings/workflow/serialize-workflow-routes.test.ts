import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeWorkflowRoutes } from './serialize-workflow-routes.js'

const leaf = (name: string) => `#pikku/${name}`

describe('serializeWorkflowRoutes', () => {
  test('both stream variants are the same core poller, told how much to say', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    // The poller lives in core behind rpc.exposedWorkflow, so a route only
    // names which variant it wants.
    assert.equal(result.match(/exposedWorkflow\.streamStatus\(/g)?.length, 1)
    assert.equal(
      result.match(/exposedWorkflow\.streamStatusFull\(/g)?.length,
      1
    )
    assert.ok(!result.includes('streamWorkflowRunStatus'))
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

  test('emits an approve route wired to rpc.exposedWorkflow.approve', () => {
    const { functions: result } = serializeWorkflowRoutes(leaf)

    assert.match(result, /route: '\/workflow\/:workflowName\/approve\/:runId'/)
    assert.match(result, /func: workflowApprover/)
    assert.match(
      result,
      /await wire\.rpc\.exposedWorkflow\.approve\(workflowName, runId, reason, decision\)/
    )
  })

  const body = (output: string, name: string) => {
    const start = output.indexOf(`export const ${name} =`)
    assert.notEqual(start, -1, `expected ${name} to be generated`)
    const end = output.indexOf('\nexport const ', start + 1)
    return output.slice(start, end === -1 ? undefined : end)
  }

  const routeFunctions = [
    'workflowStarter',
    'workflowRunner',
    'workflowStatusChecker',
    'workflowStatusStream',
    'workflowStatusStreamFull',
    'workflowApprover',
  ]

  for (const name of routeFunctions) {
    test(`${name} leaves the session optional: the workflow decides`, () => {
      const { functions } = serializeWorkflowRoutes(leaf)
      const declaration = body(functions, name)
      assert.match(declaration, /= pikkuSessionlessFunc\(\{/)
      assert.match(declaration, /\n  auth: false,/)
    })
  }

  test('one route per action: there is no separate anonymous route', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    assert.ok(!functions.includes('/anonymous'))
    assert.equal(
      functions.match(/route: '\/workflow\/:workflowName\/start'/g)?.length,
      1
    )
  })

  test('every route goes through rpc.exposedWorkflow and holds no access logic', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    const calls: Record<string, string> = {
      workflowStarter: 'exposedWorkflow.start(workflowName, data)',
      workflowRunner: 'exposedWorkflow.run(workflowName, data)',
      workflowStatusChecker: 'exposedWorkflow.status(workflowName, runId)',
      workflowStatusStream: 'exposedWorkflow.streamStatus(workflowName, runId)',
      workflowStatusStreamFull:
        'exposedWorkflow.streamStatusFull(workflowName, runId)',
      workflowApprover:
        'exposedWorkflow.approve(workflowName, runId, reason, decision)',
    }
    for (const [name, call] of Object.entries(calls)) {
      assert.ok(
        body(functions, name).includes(`wire.rpc.${call}`),
        `${name} should call wire.rpc.${call}`
      )
    }
    // The expose gate and the declaration checks are the callee's, so none of
    // them can appear in generated code, and the start is not made internally.
    for (const logic of [
      /checkWorkflowRunAccess/,
      /streamWorkflowRunStatus/,
      /startWorkflow\(/,
      /runToCompletion/,
      /approveStep/,
      /\bexpose\b/,
    ]) {
      const code = functions
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      assert.ok(!logic.test(code), `generated routes must not contain ${logic}`)
    }
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
      /func: async \(\{ workflowService \}, \{ workflowName, runId, reason, decision \}, wire\)/
    )
  })

  test('takes every payload from the sibling zod module, never a generic', () => {
    const { schemas, functions } = serializeWorkflowRoutes(leaf)

    assert.match(schemas, /import \{ z \} from 'zod'/)
    assert.match(schemas, /export const WorkflowStart = z\.object\(\{/)
    assert.match(functions, /from '\.\/workflow-routes\.schemas\.gen\.js'/)
    assert.match(functions, /input: WorkflowStart/)
    assert.ok(
      !/pikku(Sessionless)?Func</.test(functions),
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
