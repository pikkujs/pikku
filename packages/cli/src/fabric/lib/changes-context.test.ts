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
let fabricDown = false
const fabricCalls: { name: string; data: any }[] = []

void mock.module('./config.js', () => ({
  ...configLib,
  resolveApiContext: async (opts: { resolveProject?: boolean } = {}) => ({
    apiUrl: 'https://fabric.test',
    apiUrlSource: 'flag',
    token,
    projectId: opts.resolveProject === false ? null : linked,
    project: null,
  }),
}))

void mock.module('./http.js', () => ({
  ...httpLib,
  getFabricRPC: () => ({
    invoke: async (name: string, data: any) => {
      fabricCalls.push({ name, data })
      if (fabricDown) throw new Error('fabric is down')
      if (name === 'listStages')
        return { stages: [{ stageId: 'stage_main', branch: 'main' }] }
      if (name === 'createChange')
        return { change: { changeId: `fab_${fabricCalls.length}` } }
      if (name === 'claimChanges') return { group: { groupId: 'fab_group' } }
      return {}
    },
  }),
}))

const { changesContext } = await import('./changes.js')
const { fabricLinks } = await import('./changes-local.js')
const { FabricChangesFile } =
  await import('../functions/changes-file.function.js')
const { FabricChangesList } =
  await import('../functions/changes-list.function.js')
const { FabricChangesClaim } =
  await import('../functions/changes-claim.function.js')
const { FabricChangesReply } =
  await import('../functions/changes-reply.function.js')
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
  fabricDown = false
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
  test('writes go to the local file and are registered with fabric', async () => {
    token = 'tok'
    linked = 'proj_1'
    const { change } = await file('Registered')
    const created = fabricCalls.find((c) => c.name === 'createChange')!
    assert.strictEqual(created.data.stageId, 'stage_main')
    assert.strictEqual(created.data.title, 'Registered')
    const links = await fabricLinks(join(repo, '.git', 'pikku-changes.json'))
    const fabricId = links.changes[change.changeId]
    assert.ok(fabricId)

    await FabricChangesClaim.func(
      {} as any,
      { changeIds: [change.shortId], needsPlan: false } as any
    )
    const claimed = fabricCalls.find((c) => c.name === 'claimChanges')!
    assert.deepStrictEqual(claimed.data.changeIds, [fabricId])
    assert.strictEqual(claimed.data.projectId, 'proj_1')

    await FabricChangesReply.func(
      {} as any,
      { changeId: change.shortId, message: 'on it' } as any
    )
    const replied = fabricCalls.find((c) => c.name === 'replyToChange')!
    assert.strictEqual(replied.data.changeId, fabricId)
    assert.strictEqual(replied.data.projectId, undefined)
  })

  test('logged in without a linked project stays local', async () => {
    token = 'tok'
    const { change } = await file('Logged in, unlinked')
    const { changes } = await list()
    assert.ok(changes.some((c: any) => c.changeId === change.changeId))
    assert.strictEqual(fabricCalls.length, 0)
  })

  test('reads never call fabric', async () => {
    token = 'tok'
    linked = 'proj_1'
    await list()
    const { rpc, projectId } = await changesContext(undefined)
    await rpc.invoke('getChange', { changeId: '1', projectId })
    assert.strictEqual(fabricCalls.length, 0)
  })

  test('a fabric failure keeps the local write', async () => {
    token = 'tok'
    linked = 'proj_1'
    fabricDown = true
    const { change } = await file('Offline')
    const { changes } = await list()
    assert.ok(changes.some((c: any) => c.changeId === change.changeId))
  })
})
