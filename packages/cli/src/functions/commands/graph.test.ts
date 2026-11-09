import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildFunctionGraph,
  formatFunctionGraph,
  nearMatches,
  type GraphState,
} from './graph.js'

const state = {
  functions: {
    meta: {
      listTodos: {
        pikkuFuncId: 'listTodos',
        description: 'List todos',
        sourceFile: 'src/todos.ts',
        bodyStart: 3,
        bodyEnd: 9,
        sessionless: false,
        scopes: ['todos:read'],
        permissions: [{ type: 'wire', name: 'isOwner' }],
        middleware: [{ type: 'tag', tag: 'api' }],
        services: { optimized: true, services: ['kysely'] },
      },
      digest: {
        pikkuFuncId: 'digest',
        invokes: ['listTodos', 'ghost'],
        startsWorkflows: ['nightly'],
      },
      nightlyBody: { pikkuFuncId: 'nightlyBody' },
    },
  },
  http: {
    meta: {
      get: {
        '/todos': {
          pikkuFuncId: 'listTodos',
          route: '/todos',
          method: 'get',
          auth: true,
          requiresSession: true,
          middleware: [{ type: 'http', route: '/*' }],
        },
        '/other': { pikkuFuncId: 'digest' },
      },
    },
    routeMiddleware: new Map([['/*', { instanceIds: ['i1'] }]]),
  },
  channels: {
    meta: {
      feed: {
        route: '/feed',
        connect: null,
        message: { pikkuFuncId: 'listTodos' },
        messageWirings: { action: { sub: { pikkuFuncId: 'listTodos' } } },
      },
    },
  },
  gateways: { meta: {} },
  scheduledTasks: {
    meta: { daily: { pikkuFuncId: 'digest', schedule: '0 8 * * *' } },
  },
  queueWorkers: { meta: { mail: { pikkuFuncId: 'listTodos' } } },
  triggers: { meta: {}, sourceMeta: {} },
  mcpEndpoints: {
    toolsMeta: { todos: { pikkuFuncId: 'listTodos' } },
    resourcesMeta: {},
    promptsMeta: {},
  },
  cli: {
    meta: {
      programs: {
        app: {
          commands: {
            todos: {
              pikkuFuncId: 'x',
              subcommands: { ls: { pikkuFuncId: 'listTodos' } },
            },
          },
        },
      },
    },
  },
  workflows: {
    meta: {
      nightly: { name: 'nightly', pikkuFuncId: 'nightlyBody', steps: [] },
    },
    graphMeta: {
      nightly: {
        nodes: {
          a: { nodeId: 'a', rpcName: 'listTodos', stepName: 'load' },
          b: { nodeId: 'b', flow: 'wait' },
        },
      },
    },
  },
  agents: { agentsMeta: { helper: { tools: ['listTodos'] } } },
  middleware: {
    definitions: { logTodos: { sourceFile: 'src/mw.ts', description: 'logs' } },
    instances: { i1: { definitionId: 'logTodos' } },
    tagMiddleware: new Map([['api', { instanceIds: ['i1'] }]]),
    globalFiles: new Set(['src/global.ts']),
  },
  permissions: {
    definitions: { isOwner: { sourceFile: 'src/perm.ts' }, signedIn: {} },
    instances: {},
    global: [{ definitionIds: ['signedIn'] }],
  },
} as unknown as GraphState

describe('buildFunctionGraph', () => {
  const g = buildFunctionGraph(state, 'listTodos')

  test('describes the function', () => {
    assert.equal(g.function.sourceFile, 'src/todos.ts')
    assert.equal(g.function.bodyStart, 3)
    assert.deepEqual(g.function.services, ['kysely'])
    assert.deepEqual(g.function.scopes, ['todos:read'])
  })

  test('joins every kind of caller back to the function id', () => {
    const kinds = g.callers.map((c) => `${c.kind}:${c.name}`).sort()
    assert.deepEqual(kinds, [
      'agentTool:helper',
      'channel:feed',
      'channel:feed',
      'cli:app todos ls',
      'function:digest',
      'http:GET /todos',
      'mcpTool:todos',
      'queue:mail',
      'workflowStep:nightly',
    ])
    const http = g.callers.find((c) => c.kind === 'http')!
    assert.equal(http.detail.requiresSession, true)
    assert.deepEqual(http.middleware, ['http:/*'])
  })

  test('does not claim callers of other functions', () => {
    const d = buildFunctionGraph(state, 'digest')
    assert.deepEqual(d.callers.map((c) => c.kind).sort(), ['http', 'scheduler'])
    assert.equal(
      d.callers.find((c) => c.kind === 'scheduler')!.detail.schedule,
      '0 8 * * *'
    )
  })

  test('resolves permissions and group middleware, including via a wiring', () => {
    assert.equal(
      g.gates.permissions[0].definitions[0].sourceFile,
      'src/perm.ts'
    )
    assert.deepEqual(
      g.gates.globalPermissions.map((p) => p.id),
      ['signedIn']
    )
    const refs = g.gates.middleware.map((m) => m.ref).sort()
    assert.deepEqual(refs, ['http:/*', 'tag:api'])
    assert.equal(g.gates.middleware[0].definitions[0].id, 'logTodos')
    assert.deepEqual(g.gates.globalMiddlewareFiles, ['src/global.ts'])
  })

  test('callees are listed as the meta names them', () => {
    const d = buildFunctionGraph(state, 'digest')
    assert.deepEqual(
      d.callees.invokes.map((i) => i.id),
      ['listTodos', 'ghost']
    )
    assert.equal(d.callees.startsWorkflows[0].name, 'nightly')
  })

  test('a workflow body lists its steps and its starters', () => {
    const w = buildFunctionGraph(state, 'nightlyBody')
    assert.equal(w.function.workflow, 'nightly')
    assert.deepEqual(
      w.callees.workflowSteps.map((s) => s.id),
      ['listTodos']
    )
    assert.ok(
      w.callers.some((c) => c.kind === 'function' && c.name === 'digest')
    )
  })

  test('carries no unresolved or not-recorded section', () => {
    assert.equal('unresolved' in g, false)
    assert.doesNotMatch(
      formatFunctionGraph(g),
      /not recorded|absence is not proof|unknown/
    )
    assert.equal(JSON.stringify(g).includes('"known"'), false)
  })
})

describe('unknown function', () => {
  test('errors with near matches', () => {
    assert.throws(
      () => buildFunctionGraph(state, 'listTodo'),
      /Function not found: listTodo\. Did you mean: listTodos/
    )
  })
  test('nearMatches ignores far ids', () => {
    assert.deepEqual(nearMatches(['alpha', 'zzzzzz'], 'alpho'), ['alpha'])
  })
})
