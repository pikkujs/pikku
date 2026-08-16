import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { deriveCatalogue, deriveIntents } from './virtual-user-derive.js'
import { personaVirtualUserTarget } from './virtual-user-target.js'
import type { FunctionsMeta } from '../../function/function-meta.types.js'
import type { WorkflowsMeta } from '../workflow/workflow.types.js'
import type {
  ScenarioPersona,
  ScenarioHttpResponse,
} from '../../services/personas-service.js'

/**
 * `expose: true` by default, because these fixtures stand for functions a
 * virtual user could actually call. The two cases that matter — explicitly
 * unexposed, and the far commoner un-annotated — are spelled out where they
 * are tested.
 */
const fn = (
  extra: Partial<FunctionsMeta[string]> = {}
): FunctionsMeta[string] =>
  ({
    pikkuFuncId: 'f',
    inputSchemaName: null,
    outputSchemaName: null,
    expose: true,
    ...extra,
  }) as FunctionsMeta[string]

describe('deriving the catalogue from generated meta', () => {
  const functions: FunctionsMeta = {
    createProject: fn({
      description: 'Create a project',
      inputSchemaName: 'CreateProjectInput',
      outputSchemaName: 'CreateProjectOutput',
      scopes: ['org:admin', 'org:admin'],
      tags: ['projects'],
    }),
    getProject: fn({ readonly: true, summary: 'Read a project' }),
    deployStage: fn({ approvalRequired: true }),
    internalReindex: fn({ expose: false }),
    // No `expose` at all — the shape almost half the e2e app's functions are
    // in, and the one that used to reach the model and 404.
    agentCaller: fn({ expose: undefined }),
    userSeesTheDashboard: fn({ scenarioStep: true }),
    onboardingScenario: fn({ scenario: true }),
    // The two subjects nobody signs in as. Both spelled with `expose: true` on
    // purpose: the point is that being marked as a step kind is what withholds
    // them, so the exclusion survives someone exposing one by mistake.
    trialHasExpired: fn({ scenarioStep: true, scenarioStepKind: 'platform' }),
    stripeWebhookArrives: fn({
      scenarioStep: true,
      scenarioStepKind: 'addon',
      scenarioStepAddon: 'stripe',
    }),
  }

  const schemas = {
    CreateProjectInput: {
      type: 'object',
      properties: { name: { type: 'string' }, orgId: { type: 'string' } },
      required: ['name'],
    },
    CreateProjectOutput: {
      type: 'object',
      properties: { projectId: { type: 'string' } },
    },
  }

  test('an rpc arrives with its schema, scopes and gates attached', () => {
    const [entry] = deriveCatalogue(functions, schemas)
    assert.deepEqual(entry, {
      name: 'createProject',
      description: 'Create a project',
      readonly: undefined,
      approvalRequired: undefined,
      scopes: ['org:admin'],
      tags: ['projects'],
      inputKeys: ['name', 'orgId'],
      outputKeys: ['projectId'],
      inputSchema: schemas.CreateProjectInput,
      outputSchema: schemas.CreateProjectOutput,
    })
  })

  test('nothing that cannot be called over the wire is offered', () => {
    const names = deriveCatalogue(functions, schemas).map((e) => e.name)
    assert.deepEqual(names, [
      'createProject',
      'getProject',
      'deployStage',
      // internalReindex is not exposed and agentCaller was never put on the rpc
      // transport at all; the scenario body and its step are not shipped.
    ])
  })

  // Found by running one: 4 of 11 calls in the first live run were 404s, all of
  // them functions with no `expose` annotation. Absent has to mean no.
  test('a function that was never exposed is not offered either', () => {
    const names = deriveCatalogue(functions, schemas).map((e) => e.name)
    assert.ok(!names.includes('agentCaller'))
  })

  // Oracle integrity, not tidiness. A virtual user that can invoke "Stripe's
  // webhook arrives" forges its own payment success, and every finding
  // downstream of that is worthless — so this is enforced at derivation rather
  // than left to whoever remembers not to expose a step.
  test('the platform and an addon are not things a virtual user can be', () => {
    const names = deriveCatalogue(functions, schemas).map((e) => e.name)
    assert.ok(!names.includes('trialHasExpired'))
    assert.ok(!names.includes('stripeWebhookArrives'))
  })

  test('a step kind is withheld even if nothing else marked it a step', () => {
    const names = deriveCatalogue(
      { stripeWebhookArrives: fn({ scenarioStepKind: 'addon' }) },
      {}
    ).map((e) => e.name)
    assert.deepEqual(names, [])
  })

  test('an approval gate and a readonly flag survive the trip', () => {
    const entries = deriveCatalogue(functions, schemas)
    assert.equal(entries.find((e) => e.name === 'getProject')?.readonly, true)
    assert.equal(
      entries.find((e) => e.name === 'deployStage')?.approvalRequired,
      true
    )
  })

  test('a summary stands in when nobody wrote a description', () => {
    const entries = deriveCatalogue(functions, schemas)
    assert.equal(
      entries.find((e) => e.name === 'getProject')?.description,
      'Read a project'
    )
  })

  test('a missing schema is absent rather than invented', () => {
    const entries = deriveCatalogue(
      { orphan: fn({ inputSchemaName: 'NotGenerated' }) },
      {}
    )
    assert.equal(entries[0]!.inputSchema, undefined)
    assert.equal(entries[0]!.inputKeys, undefined)
  })

  test('meta the project never produced derives an empty catalogue, not a crash', () => {
    assert.deepEqual(deriveCatalogue({} as FunctionsMeta), [])
  })
})

describe('deriving intents from scenarios', () => {
  const functions: FunctionsMeta = {
    aSignedInAdmin: fn({ scenarioStepTemplate: 'is signed in' }),
    invitesATeammate: fn({ scenarioStepTemplate: 'invites {email}' }),
    seesTheMemberList: fn({ description: 'sees the new member in the list' }),
    unnamedStep: fn({}),
  }

  const workflows = {
    inviteFlow: {
      name: 'inviteFlow',
      scenario: true,
      title: 'Invite a teammate',
      description: 'An admin brings someone new into the org',
      tags: ['org'],
      actors: ['orgAdmin'],
      steps: [
        {
          type: 'scenarioStep',
          stepName: 'a',
          stepFunc: 'aSignedInAdmin',
          phase: 'given',
          actor: 'orgAdmin',
        },
        {
          type: 'scenarioStep',
          stepName: 'b',
          stepFunc: 'invitesATeammate',
          phase: 'when',
          actor: 'orgAdmin',
        },
        {
          type: 'scenarioStep',
          stepName: 'c',
          stepFunc: 'seesTheMemberList',
          phase: 'then',
          actor: 'orgAdmin',
        },
        {
          type: 'scenarioStep',
          stepName: 'd',
          stepFunc: 'unnamedStep',
          phase: 'then',
        },
        { type: 'rpc', stepName: 'e', rpcName: 'createProject' },
      ],
    },
    quarantined: {
      name: 'quarantined',
      scenario: true,
      title: 'Flaky thing',
      skip: 'fails on CI',
      steps: [],
    },
    nightlyReport: { name: 'nightlyReport', steps: [] },
  } as unknown as WorkflowsMeta

  test('a scenario becomes an intent in its own words', () => {
    const [intent] = deriveIntents(workflows, functions)
    assert.equal(intent!.id, 'inviteFlow')
    assert.equal(intent!.title, 'Invite a teammate')
    assert.equal(
      intent!.description,
      'An admin brings someone new into the org'
    )
    assert.deepEqual(intent!.personas, ['orgAdmin'])
    assert.deepEqual(intent!.tags, ['org'])
  })

  test('the prose comes through with its placeholders left open', () => {
    const [intent] = deriveIntents(workflows, functions)
    assert.deepEqual(intent!.steps, [
      'Given the orgAdmin is signed in',
      // The scenario knows which address it invites. The user has to pick one.
      'When the orgAdmin invites {email}',
      'Then the orgAdmin sees the new member in the list',
    ])
  })

  test('a step with no sentence is dropped rather than named', () => {
    const [intent] = deriveIntents(workflows, functions)
    assert.ok(intent!.steps!.every((step) => !step.includes('unnamedStep')))
  })

  test('the rpcs a scenario calls are never passed on — finding them is the test', () => {
    const [intent] = deriveIntents(workflows, functions)
    assert.ok(
      !JSON.stringify(intent).includes('createProject'),
      'a scenario’s own rpc leaked into the intent'
    )
  })

  test('a quarantined scenario does not get to drive real traffic', () => {
    const ids = deriveIntents(workflows, functions).map((i) => i.id)
    assert.ok(!ids.includes('quarantined'))
  })

  test('ordinary workflows are not scenarios and are left alone', () => {
    const ids = deriveIntents(workflows, functions).map((i) => i.id)
    assert.deepEqual(ids, ['inviteFlow'])
  })

  test('a scenario with no prose still yields an intent from its title', () => {
    const intents = deriveIntents(
      {
        bare: { name: 'bare', scenario: true, steps: [] },
      } as unknown as WorkflowsMeta,
      {}
    )
    assert.equal(intents.length, 1)
    assert.equal(intents[0]!.title, 'bare')
    assert.equal(intents[0]!.steps, undefined)
  })

  // What `getWorkflowMeta()` returns is the graph the CLI wrote, not the
  // inspector state the runner holds: same scenario, `nodes` instead of
  // `steps` and `source` instead of `scenario`. The console derives its screen
  // from this shape, so reading only the runner's would show every user with
  // nothing it wants.
  test('a scenario read back off disk yields the same intent as the runner sees', () => {
    const intents = deriveIntents(
      {
        inviteFlow: {
          name: 'inviteFlow',
          source: 'scenario',
          title: 'Invite a teammate',
          actors: ['orgAdmin'],
          nodes: {
            step_0: { nodeId: 'step_0', flow: 'branch', branches: [] },
            a: {
              nodeId: 'a',
              rpcName: 'aSignedInAdmin',
              scenarioStepPhase: 'given',
              actor: 'orgAdmin',
            },
            b: {
              nodeId: 'b',
              rpcName: 'invitesATeammate',
              scenarioStepPhase: 'when',
              actor: 'orgAdmin',
            },
          },
        },
      } as unknown as WorkflowsMeta,
      functions
    )

    assert.deepEqual(intents[0]!.steps, [
      'Given the orgAdmin is signed in',
      'When the orgAdmin invites {email}',
    ])
    assert.deepEqual(intents[0]!.personas, ['orgAdmin'])
  })

  test('an ordinary workflow read off disk is still not a scenario', () => {
    const intents = deriveIntents(
      {
        nightly: { name: 'nightly', source: 'workflow', nodes: {} },
      } as unknown as WorkflowsMeta,
      functions
    )
    assert.deepEqual(intents, [])
  })
})

describe('driving a virtual user through a signed-in actor', () => {
  const response: ScenarioHttpResponse = {
    status: 200,
    ok: true,
    body: {},
    serialized: '{}',
  }

  const stubPersona = (
    overrides: Partial<ScenarioPersona> = {}
  ): ScenarioPersona =>
    ({
      name: 'orgAdmin',
      email: 'admin@personas.invalid',
      invoke: async () => ({}),
      invokeRaw: async () => response,
      converse: async () => ({ passed: true, reasoning: 'ok', transcript: [] }),
      sessionRoles: async () => [],
      ...overrides,
    }) as ScenarioPersona

  test('a call goes out as the persona, and a refusal comes back as data', async () => {
    const seen: unknown[] = []
    const target = personaVirtualUserTarget(
      stubPersona({
        invokeRaw: async (rpcName: string, data: unknown) => {
          seen.push([rpcName, data])
          return { status: 403, ok: false, body: {}, serialized: '{}' }
        },
      })
    )

    const result = await target.call('createProject', { name: 'x' })
    assert.deepEqual(seen, [['createProject', { name: 'x' }]])
    assert.equal(result.status, 403)
  })

  test('an app with no agents gives its users nobody to talk to', () => {
    assert.equal(personaVirtualUserTarget(stubPersona()).talkTo, undefined)
  })

  test('an agent it was told about is reached in persona', async () => {
    let asked: unknown = null
    const target = personaVirtualUserTarget(
      stubPersona({
        converse: async (options: unknown) => {
          asked = options
          return { passed: true, reasoning: 'sorted', transcript: [] }
        },
      }),
      { agents: ['support'], model: 'test-model' }
    )

    const verdict = await target.talkTo!('support', 'cancel my plan')
    assert.equal(verdict.passed, true)
    assert.deepEqual(asked, {
      agent: 'support',
      task: 'cancel my plan',
      evaluate: 'The assistant did what was asked: cancel my plan',
      model: 'test-model',
    })
  })

  test('an agent it invented is answered, not dialled', async () => {
    let called = false
    const target = personaVirtualUserTarget(
      stubPersona({
        converse: async () => {
          called = true
          return { passed: true, reasoning: '', transcript: [] }
        },
      }),
      { agents: ['support'] }
    )

    const verdict = await target.talkTo!('concierge', 'anything')
    assert.equal(called, false)
    assert.equal(verdict.passed, false)
    assert.match(verdict.reasoning, /no assistant called 'concierge'/)
  })
})
