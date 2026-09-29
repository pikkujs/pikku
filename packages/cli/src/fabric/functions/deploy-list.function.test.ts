import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'

/**
 * The hint is only worth fetching when a deployment is actually waiting, so the
 * read path must not grow a second RPC on the ordinary list.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
let override = true

let context: { token: string | null; projectId: string | null }
let responses: Record<string, unknown>
const invoked: string[] = []

mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://fabric.test', ...context }
      : realConfig.resolveApiContext(opts),
}))

mock.module('../lib/http.js', () => ({
  ...realHttp,
  getFabricRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string) => {
            invoked.push(name)
            return responses[name]
          },
        }
      : realHttp.getFabricRPC(opts),
}))

after(() => {
  override = false
})

const { FabricDeployList, renderDeployList } =
  await import('./deploy-list.function.js')

const run = (data: Record<string, unknown>) =>
  FabricDeployList.func({} as any, data as any, {} as any)

const printed = (result: unknown): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => lines.push(args.join(' '))
  try {
    renderDeployList(null, result as any)
  } finally {
    console.log = log
  }
  return lines.join('\n')
}

const suspendedDeployments = {
  deployments: [
    {
      deploymentId: 'dep_1',
      status: 'suspended',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      trigger: 'push',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

const okDeployments = {
  deployments: [
    {
      deploymentId: 'dep_2',
      status: 'succeeded',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 1,
      trigger: 'push',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
}

const projectDeployments = {
  stages: [
    {
      branch: 'main',
      autoDeployOnPush: false,
      deployments: [{ status: 'suspended', statusReason: 'awaiting_approval' }],
    },
  ],
}

describe('fabric deploy list hints', () => {
  beforeEach(() => {
    context = { token: 'user-token', projectId: 'proj_1' }
    invoked.length = 0
    responses = {
      listStages: {
        stages: [{ branch: 'main', stageId: 'stage_1' }],
      },
      listDeployments: suspendedDeployments,
      getProjectDeployments: projectDeployments,
    }
  })

  test('adds the auto-deploy hint when a deployment is waiting', async () => {
    const result = await run({ branch: 'main' })
    assert.deepStrictEqual(result.hints, [
      'waiting for approval — auto-deploy is off (pikku fabric deploy auto on -b main)',
    ])
    assert.deepStrictEqual(invoked, [
      'listStages',
      'listDeployments',
      'getProjectDeployments',
    ])
  })

  test('does not ask about auto-deploy when nothing is waiting', async () => {
    responses.listDeployments = okDeployments
    const result = await run({ branch: 'main' })
    assert.deepStrictEqual(result.hints, [])
    assert.deepStrictEqual(invoked, ['listStages', 'listDeployments'])
  })

  test('renders the hint under the table', () => {
    const out = printed({
      branch: 'main',
      deployments: suspendedDeployments.deployments,
      hints: ['auto-deploy is off'],
    })
    assert.match(out, /auto-deploy is off/)
  })

  test('refuses without a login', async () => {
    context.token = null
    await assert.rejects(() => run({ branch: 'main' }), /pikku fabric login/)
    assert.strictEqual(invoked.length, 0)
  })
})
