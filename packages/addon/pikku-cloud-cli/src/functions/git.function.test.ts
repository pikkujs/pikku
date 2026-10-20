import { after, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import * as configLib from '../lib/config.js'
import * as httpLib from '../lib/http.js'
import * as gitLib from '@pikku/cli/addon-support'
import * as projectIdLib from '../lib/project-id.js'

const realConfig = { ...configLib }
const realHttp = { ...httpLib }
const realGit = { ...gitLib }
const realProjectId = { ...projectIdLib }
let override = true

let context: { token: string | null; apiUrl: string; projectId: string | null }
let clean = true
let remotes: Record<string, string>

const invoked: { name: string; data: any }[] = []
const gitCalls: string[][] = []

await mock.module('../lib/config.js', () => ({
  ...realConfig,
  resolveApiContext: async (opts?: any) =>
    override ? { ...context } : realConfig.resolveApiContext(opts),
}))

await mock.module('../lib/http.js', () => ({
  ...realHttp,
  getCloudRPC: (opts: any) =>
    override
      ? {
          invoke: async (name: string, data: any) => {
            invoked.push({ name, data })
            if (name === 'getProjectDetails')
              return { gitRepoUrl: 'https://github.com/acme/shop' }
            if (name === 'setProjectRepo')
              return {
                projectId: data.projectId,
                dryRun: data.dryRun,
                copied: true,
                from: {
                  provider: 'github',
                  repoUrl: 'https://github.com/acme/shop',
                },
                to: {
                  provider: 'gitea',
                  repoUrl: 'https://gitea.test/projects/shop',
                  cloneUrl: 'https://gitea.test/projects/shop.git',
                },
                steps: ['verified'],
              }
            return {}
          },
        }
      : realHttp.getCloudRPC(opts),
}))

await mock.module('../lib/project-id.js', () => ({
  ...realProjectId,
  isTreeCleanBesidesProjectId: async (...args: any[]) =>
    override
      ? clean
      : (realProjectId.isTreeCleanBesidesProjectId as any)(...args),
}))

await mock.module('@pikku/cli/addon-support', () => ({
  ...realGit,
  currentBranch: async () => (override ? 'main' : realGit.currentBranch()),
  hasRemote: async (name = 'origin', ...rest: any[]) =>
    override ? name in remotes : (realGit.hasRemote as any)(name, ...rest),
  getRemoteUrl: async (name = 'origin', ...rest: any[]) =>
    override
      ? remotes[name]!.replace(/\.git$/, '')
      : (realGit.getRemoteUrl as any)(name, ...rest),
  addRemote: async (name: string, url: string, ...rest: any[]) => {
    if (!override) return (realGit.addRemote as any)(name, url, ...rest)
    gitCalls.push(['addRemote', name, url])
    remotes[name] = url
  },
  git: async (args: string[], ...rest: any[]) => {
    if (!override) return (realGit.git as any)(args, ...rest)
    gitCalls.push(args)
    if (args[0] === 'remote' && args[1] === 'get-url') return remotes[args[2]!]
    if (args[0] === 'remote' && args[1] === 'set-url')
      remotes[args[2]!] = args[3]!
    return ''
  },
}))

after(() => {
  override = false
})

const { CloudGit, resolveMoveTarget } = await import('./git.function.js')

const run = (data: Record<string, unknown> = {}) =>
  CloudGit.func({} as any, data as any, {} as any)

describe('cloud git', () => {
  beforeEach(() => {
    context = {
      token: 'user-token',
      apiUrl: 'https://cloud.test',
      projectId: 'proj_1',
    }
    clean = true
    remotes = { origin: 'https://github.com/acme/shop.git' }
    invoked.length = 0
    gitCalls.length = 0
  })

  test('maps the flags onto the RPC target', () => {
    assert.deepStrictEqual(resolveMoveTarget('gitea'), { target: 'gitea' })
    assert.deepStrictEqual(resolveMoveTarget('github', 'acme/shop'), {
      target: 'github',
      repoUrl: 'https://github.com/acme/shop',
    })
    assert.deepStrictEqual(
      resolveMoveTarget('github', 'https://github.com/acme/shop'),
      { target: 'github', repoUrl: 'https://github.com/acme/shop' }
    )
    assert.deepStrictEqual(resolveMoveTarget('https://git.example/a/b'), {
      target: 'url',
      repoUrl: 'https://git.example/a/b',
    })
    assert.throws(() => resolveMoveTarget('github'), /--repo owner\/name/)
    assert.throws(() => resolveMoveTarget('nowhere'), /Unknown --move-to/)
  })

  test('refuses an unlinked checkout', async () => {
    context.projectId = null
    await assert.rejects(
      () => run({ moveTo: 'gitea' }),
      /Not linked, run `pikku cloud link` first/
    )
    assert.strictEqual(invoked.length, 0)
  })

  test('shows where the repo lives when there is no --move-to', async () => {
    const result = await run()
    assert.deepStrictEqual(
      invoked.map((i) => i.name),
      ['getProjectDetails']
    )
    assert.strictEqual(result.current.provider, 'github')
    assert.strictEqual(result.current.origin, 'https://github.com/acme/shop')
    assert.strictEqual(result.moved, null)
  })

  test('a dry run asks cloud and changes no remote', async () => {
    const result = await run({ moveTo: 'gitea', dryRun: true })
    const call = invoked.find((i) => i.name === 'setProjectRepo')
    assert.deepStrictEqual(call?.data, {
      projectId: 'proj_1',
      target: 'gitea',
      dryRun: true,
    })
    assert.deepStrictEqual(gitCalls, [])
    assert.strictEqual(
      remotes.origin,
      'https://github.com/acme/shop.git'
    )
    assert.strictEqual(result.moved?.dryRun, true)
  })

  test('refuses to move with uncommitted changes', async () => {
    clean = false
    await assert.rejects(
      () => run({ moveTo: 'gitea' }),
      /uncommitted changes/
    )
    assert.strictEqual(
      invoked.some((i) => i.name === 'setProjectRepo'),
      false
    )
  })

  test('repoints origin and keeps the old URL as previous', async () => {
    await run({ moveTo: 'gitea' })
    assert.strictEqual(remotes.origin, 'https://gitea.test/projects/shop.git')
    assert.strictEqual(remotes.previous, 'https://github.com/acme/shop.git')
  })

  test('leaves an existing previous remote alone', async () => {
    remotes.previous = 'https://old.example/a/b.git'
    await run({ moveTo: 'gitea' })
    assert.strictEqual(remotes.previous, 'https://old.example/a/b.git')
    assert.strictEqual(remotes.origin, 'https://gitea.test/projects/shop.git')
  })

  test('adds origin when there was none', async () => {
    remotes = {}
    await run({ moveTo: 'gitea' })
    assert.deepStrictEqual(remotes, {
      origin: 'https://gitea.test/projects/shop.git',
    })
  })
})
