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

  const body = (output: string, name: string) => {
    const start = output.indexOf(`export const ${name} =`)
    assert.notEqual(start, -1, `expected ${name} to be generated`)
    const end = output.indexOf('\nexport const ', start + 1)
    return output.slice(start, end === -1 ? undefined : end)
  }

  for (const name of [
    'workflowStarter',
    'workflowRunner',
    'workflowStatusChecker',
    'workflowStatusStream',
    'workflowStatusStreamFull',
    'workflowApprover',
  ]) {
    test(`${name} needs a session`, () => {
      const { functions } = serializeWorkflowRoutes(leaf)
      const declaration = body(functions, name)
      assert.match(declaration, /= pikkuFunc\(\{/)
      assert.match(declaration, /\n  auth: true,/)
    })
  }

  test('the route group needs a session, and only the anonymous start opts out', () => {
    const { functions } = serializeWorkflowRoutes(leaf)
    const routes = functions.slice(functions.indexOf('wireHTTPRoutes({'))

    assert.match(routes, /tags: \['pikku'\],\n  auth: true,/)
    assert.equal(routes.match(/auth: false/g)?.length, 1)
    assert.match(
      routes,
      /route: '\/workflow\/:workflowName\/start\/anonymous',\n\s+method: 'post',\n\s+auth: false,\n\s+func: workflowAnonymousStarter/
    )
  })

  test('the anonymous start is the only sessionless function, and is gated as anonymous', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    assert.equal(functions.match(/= pikkuSessionlessFunc\(/g)?.length, 1)
    assert.match(
      body(functions, 'workflowAnonymousStarter'),
      /prepareWorkflowRouteStart\([\s\S]*'anonymous'\n\s+\)/
    )
  })

  test('every start goes through the route gate, as the session it is', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    for (const name of ['workflowStarter', 'workflowRunner']) {
      assert.match(
        body(functions, name),
        /prepareWorkflowRouteStart\([\s\S]*'session'\n\s+\)/
      )
    }
  })

  test('/run records the caller as the owner of the run', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    assert.match(
      body(functions, 'workflowRunner'),
      /wire: \{ type: 'http', pikkuUserId: session\?\.userId \}/
    )
  })

  test('status routes read a run only through the ownership gate, naming the workflow', () => {
    const { functions } = serializeWorkflowRoutes(leaf)

    assert.match(
      body(functions, 'workflowStatusChecker'),
      /assertWorkflowRunReadable\(run, workflowName, session\)/
    )
    for (const name of ['workflowStatusStream', 'workflowStatusStreamFull']) {
      const stream = body(functions, name)
      assert.match(stream, /workflowName/)
      assert.match(stream, /session/)
    }
  })

  test('the approver checks the workflow and the run before answering', () => {
    const { functions } = serializeWorkflowRoutes(leaf)
    const approver = body(functions, 'workflowApprover')

    assert.ok(
      approver.indexOf('assertWorkflowRunAnswerable(') <
        approver.indexOf('approveStep('),
      'the gate has to run before the decision is recorded'
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
      /func: async \(\{ workflowService \}, \{ workflowName, runId, reason, decision \}, \{ session \}\)/
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
