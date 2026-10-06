import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'

const realConfig = { ...configLib }
const realHttp = { ...httpLib }
let override = true

let context: { token: string | null; projectId: string | null }
let responses: Record<string, unknown>
const invoked: string[] = []

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override
      ? { apiUrl: 'https://fabric.test', ...context }
      : realConfig.resolveApiContext(opts),
}))

await mock.module('../lib/http.js', () => ({
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

const { FabricStatus, renderStatus } = await import('./status.function.js')

const run = (data: Record<string, unknown>) =>
  FabricStatus.func({} as any, data as any, {} as any)

const printed = (result: unknown): string => {
  const lines: string[] = []
  const log = console.log
  console.log = (...args: unknown[]) => lines.push(args.join(' '))
  try {
    renderStatus(null, result as any)
  } finally {
    console.log = log
  }
  return lines.join('\n')
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

describe('fabric status hints', () => {
  beforeEach(() => {
    context = { token: 'user-token', projectId: 'proj_1' }
    invoked.length = 0
    responses = {
      getProjectStatus: { exists: true, projectName: 'Acme' },
      getProjectDeployments: projectDeployments,
    }
  })

  test('adds the auto-deploy hint when a deployment is waiting', async () => {
    const result = await run({})
    assert.deepStrictEqual(result.hints, [
      'waiting for approval — auto-deploy is off (pikku fabric deploy auto on -b main)',
    ])
    assert.deepStrictEqual(invoked, [
      'getProjectStatus',
      'getProjectDeployments',
    ])
  })

  test('does not ask when the project does not exist', async () => {
    responses.getProjectStatus = { exists: false }
    const result = await run({})
    assert.deepStrictEqual(result.hints, [])
    assert.deepStrictEqual(invoked, ['getProjectStatus'])
  })

  test('renders the hint under the status rows', () => {
    const out = printed({
      projectId: 'proj_1',
      status: { exists: true, projectName: 'Acme' },
      hints: ['auto-deploy is off'],
    })
    assert.match(out, /auto-deploy is off/)
  })

  test('refuses without a login', async () => {
    context.token = null
    await assert.rejects(() => run({}), /pikku fabric login/)
    assert.strictEqual(invoked.length, 0)
  })
})
