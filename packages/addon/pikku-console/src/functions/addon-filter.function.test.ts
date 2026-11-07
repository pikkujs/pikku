import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { getAllMeta } from './get-all-meta.function.js'
import { getFunctionsMeta } from './get-functions-meta.function.js'

const run = (
  fn: { func: (...args: any[]) => unknown },
  ...args: unknown[]
): Promise<any> => fn.func(...args) as Promise<any>

const wire = {} as never
const admin = { session: { scopes: ['admin'] } } as never

const NAMES = ['spindle:extract', 'spindle2:extract', 'diffui:diff', 'plain']

const allMeta = () => {
  const byName = <T>(make: (name: string) => T) =>
    Object.fromEntries(NAMES.map((name) => [name, make(name)]))
  const withFuncId = (name: string) => ({ pikkuFuncId: name })
  return {
    functions: NAMES.map(withFuncId),
    httpMeta: NAMES.map(withFuncId),
    cliMeta: [],
    cliRenderers: {},
    channelsMeta: byName(withFuncId),
    queueMeta: byName(withFuncId),
    schedulerMeta: byName(withFuncId),
    rpcMeta: byName(withFuncId),
    mcpMeta: NAMES.map((name) => ({ pikkuFuncId: name, method: 'tool' })),
    gatewayMeta: NAMES.map(withFuncId),
    workflows: byName(withFuncId),
    triggerMeta: byName(withFuncId),
    triggerSourceMeta: byName(withFuncId),
    agentsMeta: byName(withFuncId),
    outgoingWebhooksMeta: byName(withFuncId),
    webhookSourceMeta: byName(withFuncId),
    functionUsedBy: byName(() => ({ transports: [], jobs: [], workflows: [] })),
    secretsMeta: { SPINDLE_KEY: {} },
    variablesMeta: { SPINDLE_URL: {} },
    credentialsMeta: {},
    virtualUsers: { owner: {} },
    counts: { functions: 4, cliCommands: 2, emails: 1, secrets: 1 },
  }
}

const metaServices = () =>
  ({ wiringService: { readAllMeta: async () => allMeta() } }) as never

const keysOf = (value: unknown) => Object.keys(value as object)

describe('getAllMeta', () => {
  test('without an addon returns everything as before', async () => {
    const result = await run(getAllMeta, metaServices(), null, wire)
    assert.equal(result.functions.length, 4)
    assert.equal(keysOf(result.workflows).length, 4)
  })

  test('an empty input behaves like no filter', async () => {
    const result = await run(getAllMeta, metaServices(), {}, wire)
    assert.equal(result.functions.length, 4)
  })

  test('an addon keeps only its own items in every namespaced collection', async () => {
    const result: any = await run(
      getAllMeta,
      metaServices(),
      { addon: 'spindle' },
      wire
    )
    assert.deepEqual(
      result.functions.map((f: any) => f.pikkuFuncId),
      ['spindle:extract']
    )
    for (const key of [
      'channelsMeta',
      'queueMeta',
      'schedulerMeta',
      'rpcMeta',
      'workflows',
      'triggerMeta',
      'triggerSourceMeta',
      'agentsMeta',
      'outgoingWebhooksMeta',
      'webhookSourceMeta',
      'functionUsedBy',
    ]) {
      assert.deepEqual(keysOf(result[key]), ['spindle:extract'], key)
    }
    for (const key of ['httpMeta', 'mcpMeta', 'gatewayMeta']) {
      assert.deepEqual(
        result[key].map((i: any) => i.pikkuFuncId),
        ['spindle:extract'],
        key
      )
    }
  })

  test('counts follow the filtered collections and the project-wide ones stay', async () => {
    const result: any = await run(
      getAllMeta,
      metaServices(),
      { addon: 'spindle' },
      wire
    )
    assert.equal(result.counts.functions, 1)
    assert.equal(result.counts.workflows, 1)
    assert.equal(result.counts.agents, 1)
    assert.equal(result.counts.mcpTools, 1)
    assert.equal(result.counts.cliCommands, 2)
    assert.equal(result.counts.emails, 1)
    assert.deepEqual(keysOf(result.virtualUsers), ['owner'])
  })

  test('an unknown addon returns empty collections', async () => {
    const result: any = await run(
      getAllMeta,
      metaServices(),
      { addon: 'ghost' },
      wire
    )
    assert.equal(result.functions.length, 0)
    assert.equal(keysOf(result.workflows).length, 0)
    assert.equal(result.counts.functions, 0)
  })

  test('an addon sharing a name prefix does not leak in', async () => {
    const result: any = await run(
      getAllMeta,
      metaServices(),
      { addon: 'spindle2' },
      wire
    )
    assert.deepEqual(
      result.functions.map((f: any) => f.pikkuFuncId),
      ['spindle2:extract']
    )
  })
})

describe('getFunctionsMeta', () => {
  const services = {
    metaService: {
      basePath: '/nonexistent/.pikku/function',
      getFunctionsMeta: async () =>
        Object.fromEntries(NAMES.map((n) => [n, { pikkuFuncId: n }])),
    },
  } as never

  test('without an addon returns every function', async () => {
    assert.equal((await run(getFunctionsMeta, services, null, wire)).length, 4)
  })

  test('an addon returns only its own', async () => {
    const result = await run(
      getFunctionsMeta,
      services,
      { addon: 'diffui' },
      wire
    )
    assert.deepEqual(
      result.map((f: any) => f.pikkuFuncId),
      ['diffui:diff']
    )
  })

  test('unknown and look-alike addons return nothing', async () => {
    for (const addon of ['ghost', 'spin', 'spindle:extract']) {
      assert.equal(
        (await run(getFunctionsMeta, services, { addon }, wire)).length,
        0,
        addon
      )
    }
  })
})
