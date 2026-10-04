import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as configLib from './config.js'
import * as httpLib from './http.js'

let token: string | null = null
let linked: string | null = null
const fabricCalls: { name: string; data: any }[] = []

mock.module('./config.js', () => ({
  ...configLib,
  resolveApiContext: async (opts: { resolveProject?: boolean } = {}) => ({
    apiUrl: 'https://fabric.test',
    apiUrlSource: 'flag',
    token,
    projectId: opts.resolveProject === false ? null : linked,
    project: null,
  }),
}))

mock.module('./http.js', () => ({
  ...httpLib,
  getFabricRPC: () => ({
    invoke: async (name: string, data: any) => {
      fabricCalls.push({ name, data })
      if (name === 'listStages')
        return { stages: [{ stageId: 'stage_main', branch: 'main' }] }
      if (name === 'createChange')
        return { change: { changeId: 'fab_1', shortId: 1 } }
      if (name === 'listChanges') return { changes: [], groups: [] }
      return {}
    },
  }),
}))

const { changesContext } = await import('./changes.js')
const { FabricChangesFile } =
  await import('../functions/changes-file.function.js')
const { FabricChangesList } =
  await import('../functions/changes-list.function.js')
const { FabricChangesClaim } =
  await import('../functions/changes-claim.function.js')
const { next } = await import('../../functions/commands/next.js')

const home = process.cwd()
let repo: string

const file = (title: string) =>
  FabricChangesFile.func({} as any, { title } as any) as Promise<any>
const list = () =>
  FabricChangesList.func(
    {} as any,
    { includeDone: true } as any
  ) as Promise<any>

before(() => {
  const sh = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  return mkdtemp(join(tmpdir(), 'changes-context-')).then((dir) => {
    repo = dir
    sh('init', '-q', '-b', 'main')
    sh(
      '-c',
      'user.email=t@t',
      '-c',
      'user.name=t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init'
    )
    process.chdir(repo)
  })
})

after(() => process.chdir(home))

beforeEach(() => {
  token = null
  linked = null
  fabricCalls.length = 0
})

describe('changes on a local project', () => {
  test('file and list work without a fabric login', async () => {
    const { change } = await file('Local one')
    const { changes } = await list()
    assert.ok(changes.some((c: any) => c.changeId === change.changeId))
    assert.strictEqual(fabricCalls.length, 0)
    const store = JSON.parse(
      await readFile(join(repo, '.git', 'pikku-changes.json'), 'utf8')
    )
    assert.ok(store.changes.some((c: any) => c.title === 'Local one'))
  })

  test('linked but logged out stays local', async () => {
    linked = 'proj_1'
    await file('Linked, logged out')
    assert.strictEqual(fabricCalls.length, 0)
  })

  test('changes next routes the open changes to the changes agent', async () => {
    const route = (await next.func(
      { config: { rootDir: repo } } as any,
      {} as any
    )) as any
    assert.strictEqual(route.agent, 'changes')
    assert.match(route.context, /Local one/)
  })
})

describe('changes when logged in to fabric', () => {
  const storePath = () => join(repo, '.git', 'pikku-changes.json')
  const before = async () => {
    try {
      return await readFile(storePath(), 'utf8')
    } catch {
      return null
    }
  }

  test('file and list use only the api and write no local file', async () => {
    const stored = await before()
    token = 'tok'
    linked = 'proj_1'
    await FabricChangesFile.func({} as any, { title: 'Cloud one' } as any)
    const created = fabricCalls.find((c) => c.name === 'createChange')!
    assert.strictEqual(created.data.stageId, 'stage_main')
    assert.strictEqual(created.data.title, 'Cloud one')
    await list()
    const listed = fabricCalls.find((c) => c.name === 'listChanges')!
    assert.strictEqual(listed.data.projectId, 'proj_1')
    assert.strictEqual(await before(), stored)
    assert.ok(!stored || !stored.includes('Cloud one'))
  })

  test('claim goes to the api with the given ids', async () => {
    token = 'tok'
    linked = 'proj_1'
    await FabricChangesClaim.func({} as any, { changeIds: ['chg_1'] } as any)
    const claimed = fabricCalls.find((c) => c.name === 'claimChanges')!
    assert.deepStrictEqual(claimed.data.changeIds, ['chg_1'])
    assert.strictEqual(claimed.data.projectId, 'proj_1')
  })

  test('logged in without a linked project names the fix instead of going local', async () => {
    token = 'tok'
    await assert.rejects(
      list(),
      /not linked to a project\. Run `pikku fabric link`/
    )
    assert.strictEqual(fabricCalls.length, 0)
  })

  test('--project-id stands in for the link', async () => {
    token = 'tok'
    await FabricChangesList.func({} as any, { projectId: 'proj_flag' } as any)
    assert.strictEqual(fabricCalls[0]!.data.projectId, 'proj_flag')
  })
})
