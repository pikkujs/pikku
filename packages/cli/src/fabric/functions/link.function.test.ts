import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'
import * as gitLib from '../../utils/git.js'
import * as safetyLib from '../lib/deploy-safety.js'
import * as orgLib from '../lib/organization.js'

/**
 * The command end to end, against a faked fabric and a faked git. What matters
 * is what it does NOT do: the repo is the link, so nothing is written to the
 * checkout and nothing is committed or pushed on the user's behalf — the only
 * push is the first one into a repo `--gitea` just created.
 *
 * `mock.module` outlives this file (see changes-commands.test.ts), so every
 * fake falls back to the real export once `override` is switched off.
 */
const realConfig = { ...configLib }
const realHttp = { ...httpLib }
const realGit = { ...gitLib }
const realSafety = { ...safetyLib }
const realOrg = { ...orgLib }
let override = true

let context: { token: string | null; apiUrl: string; project: any }
let hasRemote = true
let remoteUrl = 'https://gitea.test/acme/shop.git'
let clean = true
let head = 'feat/shop'

const order: string[] = []
const invoked: { name: string; data: any }[] = []
const pushes: any[][] = []

mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override ? { ...context } : realConfig.resolveApiContext(opts),
}))

mock.module('../lib/http.js', () => ({
  ...realHttp,
  getFabricRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: any) => {
            order.push(`rpc:${name}`)
            invoked.push({ name, data })
            if (name === 'importProject')
              return { projectId: 'proj_1', projectSlug: 'shop' }
            if (name === 'provisionRepo')
              return {
                repoUrl: 'https://gitea.test/acme/shop',
                cloneUrl: 'https://gitea.test/acme/shop.git',
                username: 'u',
                password: 'p',
              }
            if (name === 'deployByStageKind')
              return { deploymentId: 'dep_1', stageId: 'stage_1' }
            if (name === 'checkGithubInstall') return { installed: true }
            return {}
          },
        }
      : realHttp.getFabricRPC(opts),
}))

mock.module('../lib/organization.js', () => ({
  ...realOrg,
  resolveOrganizationId: async (...args: any[]) =>
    override ? undefined : (realOrg.resolveOrganizationId as any)(...args),
}))

mock.module('../lib/deploy-safety.js', () => ({
  ...realSafety,
  assertDeploySafety: async () => {
    if (!override) return realSafety.assertDeploySafety()
    order.push('assertDeploySafety')
    return { branch: head, headSha: 'abc123' }
  },
}))

mock.module('../../utils/git.js', () => ({
  ...realGit,
  hasCommits: async () => (override ? true : realGit.hasCommits()),
  isWorkingTreeClean: async () =>
    override ? clean : realGit.isWorkingTreeClean(),
  currentBranch: async () => (override ? head : realGit.currentBranch()),
  hasRemote: async () => (override ? hasRemote : realGit.hasRemote()),
  getRemoteUrl: async (...args: any[]) =>
    override ? remoteUrl : (realGit.getRemoteUrl as any)(...args),
  addRemote: async (...args: any[]) => {
    if (!override) return (realGit.addRemote as any)(...args)
    pushes.push(['addRemote', ...args])
  },
  removeRemote: async (...args: any[]) => {
    if (!override) return (realGit.removeRemote as any)(...args)
    pushes.push(['removeRemote', ...args])
  },
  pushWithCredential: async (...args: any[]) => {
    if (!override) return (realGit.pushWithCredential as any)(...args)
    order.push('pushWithCredential')
    pushes.push(['pushWithCredential', ...args])
  },
}))

after(() => {
  override = false
})

const { FabricLink } = await import('./link.function.js')

const run = (data: Record<string, unknown> = {}) =>
  FabricLink.func({} as any, data as any, {} as any)

describe('fabric link', () => {
  beforeEach(() => {
    context = {
      token: 'user-token',
      apiUrl: 'https://fabric.test',
      project: null,
    }
    hasRemote = true
    remoteUrl = 'https://gitea.test/acme/shop.git'
    clean = true
    head = 'feat/shop'
    order.length = 0
    invoked.length = 0
    pushes.length = 0
  })

  test('imports and deploys without writing or pushing anything', async () => {
    const result = await run()

    assert.deepStrictEqual(
      invoked.map((i) => i.name),
      ['importProject', 'deployByStageKind']
    )
    assert.deepStrictEqual(order, [
      'rpc:importProject',
      'assertDeploySafety',
      'rpc:deployByStageKind',
    ])
    assert.deepStrictEqual(pushes, [])
    assert.deepStrictEqual(result, {
      projectId: 'proj_1',
      projectSlug: 'shop',
      deploymentId: 'dep_1',
      stageId: 'stage_1',
    })
  })

  test('refuses a repo that is already some project’s remote', async () => {
    context.project = {
      projectId: 'proj_0',
      source: 'remote',
      detail: 'origin → https://gitea.test/acme/shop',
      name: 'shop',
    }
    await assert.rejects(
      () => run(),
      /Already linked[\s\S]*pikku fabric config/
    )
    assert.strictEqual(invoked.length, 0)
  })

  test('creates a repo with no origin, pushes to it, and imports that repo', async () => {
    hasRemote = false
    const result = await run({ gitea: true })

    assert.deepStrictEqual(
      invoked.map((i) => i.name),
      ['provisionRepo', 'importProject', 'deployByStageKind']
    )
    assert.deepStrictEqual(
      pushes.map((p) => p[0]),
      ['addRemote', 'pushWithCredential']
    )
    assert.strictEqual(
      invoked.find((i) => i.name === 'importProject')?.data.repoUrl,
      'https://gitea.test/acme/shop'
    )
    assert.strictEqual(result.projectId, 'proj_1')
  })

  test('refuses a detached HEAD before anything is provisioned', async () => {
    head = 'HEAD'
    await assert.rejects(() => run(), /HEAD is detached/)
    assert.strictEqual(invoked.length, 0)
  })

  test('refuses without a login before touching git', async () => {
    context.token = null
    await assert.rejects(() => run(), /pikku fabric login/)
    assert.strictEqual(invoked.length, 0)
  })

  test('refuses a dirty working tree', async () => {
    clean = false
    await assert.rejects(() => run(), /uncommitted changes/)
    assert.strictEqual(invoked.length, 0)
  })

  test('refuses --github and --gitea together', async () => {
    await assert.rejects(
      () => run({ github: true, gitea: true }),
      /two different places/
    )
    assert.strictEqual(invoked.length, 0)
  })

  test('tells a session with no terminal to pass --gitea', async () => {
    hasRemote = false
    const descriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY')
    Object.defineProperty(process.stdin, 'isTTY', {
      value: false,
      configurable: true,
    })
    try {
      await assert.rejects(() => run(), /Pass --gitea/)
    } finally {
      if (descriptor) Object.defineProperty(process.stdin, 'isTTY', descriptor)
      else delete (process.stdin as any).isTTY
    }
  })
})
