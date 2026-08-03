import { describe, test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

import { InMemoryWorkflowService } from '../../services/in-memory-workflow-service.js'
import {
  PikkuScenarioService,
  createScenarioRunner,
} from './pikku-scenario-service.js'
import { pikkuState, resetPikkuState } from '../../pikku-state.js'

const noopLogger = { error() {}, info() {}, warn() {}, debug() {} }

const SCENARIO_MEMBERS = [
  'scenarioStep',
  'runScenarioHook',
  'resolvePersonas',
  'setScenarioBrowserProvider',
  'getScenarioBrowserProvider',
  'setScenarioEnvironment',
  'getScenarioEnvironment',
]

const SCENARIO_WIRE_MEMBERS = [
  'given',
  'when',
  'then',
  'expectEventually',
  'expectError',
  'expectService',
  'runScheduledTask',
]

const setup = async (ws: InMemoryWorkflowService) => {
  pikkuState(null, 'package', 'singletonServices', {
    logger: noopLogger,
  } as any)
  const runId = await ws.createRun('surfaceTest', {}, true, 'hash', {
    type: 'test',
  } as any)
  ws.registerInlineRun(runId)
  return runId
}

describe('the production workflow service carries no scenario surface', () => {
  beforeEach(() => resetPikkuState())

  test('no scenario method is declared on the workflow service prototype chain', () => {
    const ws = new InMemoryWorkflowService()
    for (const member of SCENARIO_MEMBERS) {
      assert.equal(
        typeof (ws as any)[member],
        'undefined',
        `'${member}' ships in every production bundle while it is a member of PikkuWorkflowService`
      )
    }
  })

  test('the workflow wire exposes only workflow members', async () => {
    const ws = new InMemoryWorkflowService()
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('surfaceTest', runId, {}) as any

    for (const member of SCENARIO_WIRE_MEMBERS) {
      assert.equal(
        typeof wire[member],
        'undefined',
        `wire.${member} is a scenario affordance and must not be built for a production workflow run`
      )
    }
    for (const member of ['do', 'sleep', 'suspend', 'approval', 'getRun']) {
      assert.equal(
        typeof wire[member],
        'function',
        `wire.${member} is a workflow member and must survive`
      )
    }
  })

  test('a service with no extension installed runs a plain workflow untouched', async () => {
    const ws = new InMemoryWorkflowService()
    assert.equal(ws.getRunExtension(), undefined)
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('surfaceTest', runId, {}) as any
    assert.equal(typeof wire.do, 'function')
  })

  test('the actor client is not reachable from the workflow service module graph', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('./pikku-workflow-service.ts', import.meta.url),
      'utf8'
    )
    assert.ok(
      !source.includes('http-personas'),
      'PikkuWorkflowService must not reference the HTTP actor client — it pulls the AI persona loop into every bundle'
    )
  })
})

describe('PikkuScenarioService carries the scenario surface', () => {
  beforeEach(() => resetPikkuState())

  test('every scenario method is declared on the scenario service', () => {
    const { scenarioService } = createScenarioRunner()
    for (const member of SCENARIO_MEMBERS) {
      assert.equal(
        typeof (scenarioService as any)[member],
        'function',
        `PikkuScenarioService is missing '${member}'`
      )
    }
  })

  test('the wire it decorates carries both the workflow and the scenario members', async () => {
    const { workflowService: ws } = createScenarioRunner()
    const runId = await setup(ws)
    const wire = ws.createWorkflowWire('surfaceTest', runId, {}) as any

    for (const member of [
      ...SCENARIO_WIRE_MEMBERS,
      'do',
      'sleep',
      'approval',
    ]) {
      assert.equal(
        typeof wire[member],
        'function',
        `PikkuScenarioService's wire is missing ${member}`
      )
    }
  })

  test('it is not a workflow service, so it cannot be registered as one by mistake', () => {
    const { scenarioService } = createScenarioRunner()
    assert.ok(!(scenarioService instanceof InMemoryWorkflowService))
    assert.equal(
      typeof (scenarioService as any).startWorkflow,
      'undefined',
      'the scenario capability is layered onto a run, it does not own one'
    )
  })

  test('the runner installs it as the workflow service extension', () => {
    const { workflowService, scenarioService } = createScenarioRunner()
    assert.equal(workflowService.getRunExtension(), scenarioService)
  })
})
