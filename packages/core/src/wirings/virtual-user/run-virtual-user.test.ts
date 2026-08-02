import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { rememberIds, runVirtualUser } from './run-virtual-user.js'
import type { ActorLLM } from '../actor-flow/run-conversation.js'
import type { AIAgentStepResult } from '../../services/ai-agent-runner-service.js'
import type { ScenarioHttpResponse } from '../../services/personas-service.js'
import type {
  ApiCatalogueEntry,
  IntentSource,
  VirtualUserAction,
  VirtualUserTarget,
} from './virtual-user.types.js'

const CATALOGUE: ApiCatalogueEntry[] = [
  {
    name: 'listProjects',
    outputKeys: ['projects'],
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'createProject',
    inputKeys: ['name'],
    outputKeys: ['projectId'],
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'deployStage',
    approvalRequired: true,
    inputKeys: ['projectId'],
  },
  {
    name: 'listAllOrgs',
    scopes: ['org:admin'],
    outputKeys: ['orgs'],
  },
]

const INTENTS: IntentSource[] = [
  { id: 'onboard', title: 'set up your first project', steps: ['sign in', 'make a project'] },
]

const PERSONA = {
  id: 'member',
  email: 'ada@personas.invalid',
  name: 'Ada',
  jobTitle: 'Engineer',
  roles: [],
  goals: [],
  tags: [],
  runnable: true,
}

/**
 * An LLM that plays a fixed script, then pokes harmlessly at the catalogue —
 * so a test about budgets is not secretly a test about the script ending.
 */
const IDLE: VirtualUserAction = { kind: 'describe', rpcName: 'listProjects' }

const scripted = (
  actions: VirtualUserAction[],
  onCall?: (instructions: string, messages: string[]) => void
): { llm: ActorLLM; turns: () => number } => {
  let turn = 0
  const llm: ActorLLM = async ({ instructions, messages }) => {
    onCall?.(
      instructions,
      messages.map((m) => (typeof m.content === 'string' ? m.content : ''))
    )
    const action = actions[turn++] ?? IDLE
    return {
      text: '',
      object: action,
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 10, outputTokens: 4 },
      finishReason: 'stop',
    } satisfies AIAgentStepResult
  }
  return { llm, turns: () => turn }
}

const respond = <T>(
  status: number,
  body: T
): ScenarioHttpResponse<T> => ({
  status,
  ok: status >= 200 && status < 300,
  body,
  serialized: JSON.stringify(body),
})

/** A target that records what it was asked to do. */
const recordingTarget = (
  handler: (rpcName: string, args: unknown) => ScenarioHttpResponse
): VirtualUserTarget & { calls: { rpcName: string; args: unknown }[] } => {
  const calls: { rpcName: string; args: unknown }[] = []
  return {
    calls,
    async call(rpcName, args) {
      calls.push({ rpcName, args })
      return handler(rpcName, args)
    },
  }
}

const base = {
  persona: PERSONA,
  personaId: 'member',
  catalogue: CATALOGUE,
  intents: INTENTS,
  model: 'test-model',
  seed: 1234,
}

describe('running a virtual user', () => {
  test('it must read an endpoint’s schema before it may call it', async () => {
    const target = recordingTarget(() => respond(200, { projectId: 'p1' }))
    const { llm } = scripted([
      { kind: 'call', rpcName: 'createProject', args: { name: 'first' } },
      { kind: 'call', rpcName: 'createProject', args: { name: 'first' } },
      { kind: 'complete', summary: 'done' },
    ])

    const result = await runVirtualUser({ ...base, target, llm, budget: { steps: 3 } })

    // The first attempt cost a step and bought the schema; only the second
    // reached the server.
    assert.deepEqual(target.calls, [
      { rpcName: 'createProject', args: { name: 'first' } },
    ])
    assert.equal(result.tally.steps, 3)
    assert.equal(result.tally.calls, 1)
  })

  /**
   * The regression that stopped the first real run dead: strict structured
   * output rejects a schema-less `args` object outright, so the arguments come
   * back as a JSON string. Both spellings have to reach the server as the same
   * call, because which one arrives depends on the provider, not the user.
   */
  test('arguments arrive whether the model sends an object or a JSON string', async () => {
    const target = recordingTarget(() => respond(200, { projectId: 'p1' }))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'createProject' },
      {
        kind: 'call',
        rpcName: 'createProject',
        args: '{"name":"first"}',
      } as unknown as VirtualUserAction,
      { kind: 'complete', summary: 'done' },
    ])

    await runVirtualUser({ ...base, target, llm, budget: { steps: 3 } })

    assert.deepEqual(target.calls, [
      { rpcName: 'createProject', args: { name: 'first' } },
    ])
  })

  test('arguments that are not JSON at all are dropped rather than sent as text', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'createProject' },
      {
        kind: 'call',
        rpcName: 'createProject',
        args: 'the name is first',
      } as unknown as VirtualUserAction,
      { kind: 'complete' },
    ])

    await runVirtualUser({ ...base, target, llm, budget: { steps: 3 } })

    assert.deepEqual(target.calls, [{ rpcName: 'createProject', args: {} }])
  })

  test('the refusal hands over the schema, so it is fixed in one turn', async () => {
    const seen: string[] = []
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted(
      [
        { kind: 'call', rpcName: 'createProject', args: {} },
        { kind: 'complete' },
      ],
      (_instructions, messages) => seen.push(...messages)
    )

    await runVirtualUser({ ...base, target, llm, budget: { steps: 2 } })

    assert.ok(
      seen.some((m) => m.includes('"required":["name"]')),
      `schema was never shown: ${JSON.stringify(seen)}`
    )
  })

  test('describing an endpoint that does not exist is answered, not crashed on', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const seen: string[] = []
    const { llm } = scripted(
      [{ kind: 'describe', rpcName: 'teleport' }, { kind: 'complete' }],
      (_i, messages) => seen.push(...messages)
    )

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 2 },
    })

    assert.ok(seen.some((m) => m.includes("no endpoint called 'teleport'")))
    assert.equal(result.findings.length, 0)
  })

  test('an unparseable turn is survivable', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const llm: ActorLLM = async () => ({
      text: 'I think I will look at the projects',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 1, outputTokens: 1 },
      finishReason: 'stop',
    })

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 2 },
    })

    assert.equal(result.steps[0]!.action.kind, 'invalid')
    assert.equal(result.stoppedBy, 'budget-steps')
  })
})

describe('what a virtual user reports', () => {
  const walkTo = (rpcName: string, args: unknown = {}): VirtualUserAction[] => [
    { kind: 'describe', rpcName },
    { kind: 'call', rpcName, args },
    { kind: 'complete' },
  ]

  test('a 500 is a finding, with enough to replay it', async () => {
    const target = recordingTarget(() => respond(500, { error: 'boom' }))
    const { llm } = scripted(walkTo('createProject', { name: 'x' }))

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.equal(result.findings.length, 1)
    const [finding] = result.findings
    assert.equal(finding!.kind, 'server-error')
    assert.equal(finding!.rpcName, 'createProject')
    assert.equal(finding!.status, 500)
    assert.equal(finding!.step, 1)
    assert.equal(result.tally.findings, 1)
  })

  test('a 4xx is not — being told no is the system working', async () => {
    const target = recordingTarget(() => respond(403, { error: 'nope' }))
    const { llm } = scripted(walkTo('createProject', { name: 'x' }))

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.deepEqual(result.findings, [])
  })

  test('a transport failure is reported rather than thrown', async () => {
    const target: VirtualUserTarget = {
      async call() {
        throw new Error('socket hang up')
      },
    }
    const { llm } = scripted(walkTo('listProjects'))

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.equal(result.findings[0]!.kind, 'transport-error')
    assert.match(result.findings[0]!.detail, /socket hang up/)
    // A failed request is not a call the server ever saw.
    assert.equal(result.tally.calls, 0)
  })

  test('a response outside the endpoint’s own output schema is a finding', async () => {
    const target = recordingTarget(() => respond(200, { wrong: true }))
    const { llm } = scripted(walkTo('listProjects'))

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
      validateOutput: (rpcName, body) =>
        rpcName === 'listProjects' &&
        !(body as Record<string, unknown>).projects
          ? 'missing required property: projects'
          : null,
    })

    assert.equal(result.findings[0]!.kind, 'schema-violation')
    assert.match(result.findings[0]!.detail, /missing required property/)
  })

  test('succeeding at something this persona cannot satisfy is authorization drift', async () => {
    const target = recordingTarget(() => respond(200, { orgs: [] }))
    const { llm } = scripted(walkTo('listAllOrgs'))

    const result = await runVirtualUser({
      ...base,
      disposition: 'adversarial',
      target,
      llm,
      scopes: ['org:read'],
      budget: { steps: 3 },
    })

    assert.equal(result.findings[0]!.kind, 'unexpected-success')
    assert.match(result.findings[0]!.detail, /org:admin/)
  })

  test('the same call refused is exactly what should happen', async () => {
    const target = recordingTarget(() => respond(403, { error: 'forbidden' }))
    const { llm } = scripted(walkTo('listAllOrgs'))

    const result = await runVirtualUser({
      ...base,
      disposition: 'adversarial',
      target,
      llm,
      scopes: ['org:read'],
      budget: { steps: 3 },
    })

    assert.deepEqual(result.findings, [])
  })

  test('an app-specific oracle can add what the engine cannot know', async () => {
    const target = recordingTarget(() => respond(200, { orgId: 'someone-else' }))
    const { llm } = scripted(walkTo('listProjects'))

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
      classify: ({ body }) =>
        (body as { orgId?: string }).orgId === 'someone-else'
          ? [
              {
                kind: 'custom',
                detail: 'read another tenant’s row',
                step: 0,
              },
            ]
          : null,
    })

    assert.equal(result.findings[0]!.kind, 'custom')
    // The engine stamps the real step, so a classifier cannot misreport it.
    assert.equal(result.findings[0]!.step, 1)
  })
})

describe('what a virtual user is allowed to touch', () => {
  test('an auditor cannot reach a mutation even when it asks for one by name', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'createProject' },
      { kind: 'call', rpcName: 'createProject', args: { name: 'x' } },
      { kind: 'complete' },
    ])

    const result = await runVirtualUser({
      ...base,
      disposition: 'auditor',
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.deepEqual(target.calls, [])
    assert.equal(result.tally.mutations, 0)
  })

  test('an approval-gated endpoint is not called just because it was asked for', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'deployStage' },
      { kind: 'call', rpcName: 'deployStage', args: { projectId: 'p1' } },
      { kind: 'complete' },
    ])

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.deepEqual(target.calls, [])
    assert.equal(result.tally.calls, 0)
  })

  test('the catalogue it is shown reflects those limits', async () => {
    let instructions = ''
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }], (i) => (instructions = i))

    await runVirtualUser({
      ...base,
      disposition: 'auditor',
      target,
      llm,
      budget: { steps: 1 },
    })

    assert.ok(instructions.includes('listProjects'))
    assert.ok(!instructions.includes('createProject'))
    assert.ok(instructions.includes('Never change anything'))
  })

  test('an adversarial user is shown the whole surface on purpose', async () => {
    let instructions = ''
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }], (i) => (instructions = i))

    await runVirtualUser({
      ...base,
      disposition: 'adversarial',
      target,
      llm,
      scopes: ['org:read'],
      budget: { steps: 1 },
    })

    // Withholding what it cannot reach would hide exactly the finding worth
    // having — the scopes stay live as the oracle instead.
    assert.ok(instructions.includes('listAllOrgs'))
  })
})

describe('budgets and stopping', () => {
  // Enough to do that the run cannot simply run out of things to want.
  const busy = {
    ...base,
    goals: ['read the settings', 'check billing', 'look at the audit log'],
  }

  test('the step budget bounds the run', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm, turns } = scripted([])

    const result = await runVirtualUser({
      ...busy,
      target,
      llm,
      budget: { steps: 5 },
    })

    assert.equal(turns(), 5)
    assert.equal(result.tally.steps, 5)
    assert.equal(result.stoppedBy, 'budget-steps')
  })

  test('the mutation budget stops a destructive run before the step budget does', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'createProject' },
      { kind: 'call', rpcName: 'createProject', args: { name: 'a' } },
      { kind: 'call', rpcName: 'createProject', args: { name: 'b' } },
      { kind: 'call', rpcName: 'createProject', args: { name: 'c' } },
    ])

    const result = await runVirtualUser({
      ...busy,
      target,
      llm,
      budget: { steps: 20, mutations: 2 },
    })

    assert.equal(result.stoppedBy, 'budget-mutations')
    assert.equal(target.calls.length, 2)
  })

  test('a duration budget accepts a plain duration string', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([])

    const result = await runVirtualUser({
      ...busy,
      target,
      llm,
      budget: { steps: 50, duration: '0s' },
    })

    assert.equal(result.stoppedBy, 'budget-duration')
    assert.equal(result.tally.steps, 0)
  })

  test('the app’s own stopping rule sees the running tally', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([])
    const seen: number[] = []

    const result = await runVirtualUser({
      ...busy,
      target,
      llm,
      budget: { steps: 50 },
      // Whatever a token is worth is the app's to decide — core only counts.
      stop: (tally) => {
        seen.push(tally.tokensOut)
        return tally.tokensOut >= 12
      },
    })

    assert.equal(result.stoppedBy, 'stop-hook')
    assert.deepEqual(seen, [0, 4, 8, 12])
    assert.equal(result.tally.model, 'test-model')
  })

  test('a run with nothing to do ends immediately rather than inventing work', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm, turns } = scripted([])

    const result = await runVirtualUser({
      ...base,
      intents: [],
      goals: [],
      target,
      llm,
      budget: { steps: 10 },
    })

    assert.equal(result.stoppedBy, 'no-intents')
    assert.equal(turns(), 0)
  })

  test('a run that sees everything through ends as exhausted', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete', summary: 'all set' }])

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 10 },
    })

    assert.equal(result.stoppedBy, 'exhausted')
    assert.equal(result.intents[0]!.status, 'completed')
    assert.equal(result.intents[0]!.summary, 'all set')
  })

  test('an intent that goes in circles is given up on rather than looping forever', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([])

    const result = await runVirtualUser({
      ...base,
      // An auditor never abandons on its own, so nothing but the cap can end it.
      disposition: 'auditor',
      target,
      llm,
      budget: { steps: 40 },
      maxStepsPerIntent: 3,
    })

    assert.equal(result.intents[0]!.status, 'stuck')
    assert.match(result.intents[0]!.summary!, /circles/)
  })
})

describe('goals and persona', () => {
  test('goals in the user’s own words become intents alongside the derived ones', async () => {
    const seen: string[] = []
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }, { kind: 'complete' }], (_i, m) =>
      seen.push(...m)
    )

    const result = await runVirtualUser({
      ...base,
      goals: ['try to invite a teammate you already invited'],
      target,
      llm,
      budget: { steps: 2 },
    })

    assert.equal(result.intents.length, 2)
    assert.ok(seen.some((m) => m.includes('already invited')))
  })

  test('the persona reaches the model, and the step graph never does', async () => {
    let instructions = ''
    const seen: string[] = []
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }], (i, m) => {
      instructions = i
      seen.push(...m)
    })

    await runVirtualUser({
      ...base,
      persona: { ...PERSONA, personality: 'blunt and in a hurry' },
      target,
      llm,
      budget: { steps: 1 },
    })

    assert.ok(instructions.includes('Ada'))
    assert.ok(instructions.includes('blunt and in a hurry'))
    // It is told what it wants in prose and must find the API itself.
    assert.ok(seen.some((m) => m.includes('set up your first project')))
    assert.ok(seen.every((m) => !m.includes('createProject')))
  })
})

describe('what a virtual user carries between intents', () => {
  test('ids it saw are remembered and offered back', async () => {
    const target = recordingTarget(() => respond(200, { projectId: 'p-42' }))
    const { llm } = scripted([
      { kind: 'describe', rpcName: 'listProjects' },
      { kind: 'call', rpcName: 'listProjects', args: {} },
      { kind: 'complete' },
    ])

    const result = await runVirtualUser({
      ...base,
      target,
      llm,
      budget: { steps: 3 },
    })

    assert.equal(result.memory.projectId, 'p-42')
  })

  test('a newcomer starts with nothing, whatever it was handed', async () => {
    const seen: string[] = []
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }], (_i, m) => seen.push(...m))

    await runVirtualUser({
      ...base,
      disposition: 'newcomer',
      memory: { projectId: 'p-42' },
      target,
      llm,
      budget: { steps: 1 },
    })

    assert.ok(seen.every((m) => !m.includes('p-42')))
  })

  test('a stale user works from the notes it was given', async () => {
    const seen: string[] = []
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }], (_i, m) => seen.push(...m))

    await runVirtualUser({
      ...base,
      disposition: 'stale',
      memory: { projectId: 'p-gone' },
      target,
      llm,
      seed: 7,
      budget: { steps: 1 },
    })

    assert.ok(seen.some((m) => m.includes('p-gone')))
  })

  test('harvesting only picks up identifiers, and does not walk forever', () => {
    const memory = rememberIds(
      {
        projectId: 'p1',
        count: 12,
        nested: { orgSlug: 'acme', deep: { apiKey: 'k1' } },
        items: [{ userId: 'u1' }, { userId: 'u2' }],
        blob: 'x'.repeat(500),
      },
      {}
    )
    assert.deepEqual(memory, {
      projectId: 'p1',
      orgSlug: 'acme',
      apiKey: 'k1',
      userId: 'u2',
    })
  })

  test('a cycle does not hang the harvester', () => {
    const body: Record<string, unknown> = { orgId: 'o1' }
    body.self = body
    assert.deepEqual(rememberIds(body, {}), { orgId: 'o1' })
  })
})

describe('reproducibility', () => {
  test('the same seed replays the same run', async () => {
    const run = async (seed: number) => {
      const target = recordingTarget(() => respond(200, { projectId: 'p1' }))
      const { llm } = scripted([
        { kind: 'describe', rpcName: 'listProjects' },
        { kind: 'call', rpcName: 'listProjects', args: {} },
        { kind: 'describe', rpcName: 'createProject' },
        { kind: 'call', rpcName: 'createProject', args: { name: 'a' } },
      ])
      const result = await runVirtualUser({
        ...base,
        disposition: 'careless',
        goals: ['check the billing page', 'rename the project'],
        target,
        llm,
        seed,
        budget: { steps: 12 },
      })
      return { intents: result.intents, calls: target.calls, seed: result.seed }
    }

    const first = await run(99)
    const second = await run(99)
    assert.deepEqual(first, second)
    assert.equal(first.seed, 99)

    const other = await run(100)
    assert.notDeepEqual(other.intents, first.intents)
  })

  test('an unseeded run reports the seed it chose, so it can be replayed', async () => {
    const target = recordingTarget(() => respond(200, {}))
    const { llm } = scripted([{ kind: 'complete' }])

    const result = await runVirtualUser({
      ...base,
      seed: undefined,
      target,
      llm,
      budget: { steps: 1 },
    })

    assert.equal(typeof result.seed, 'number')
    assert.ok(Number.isInteger(result.seed))
  })
})
