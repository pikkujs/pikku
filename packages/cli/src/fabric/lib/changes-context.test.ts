import { after, before, beforeEach, describe, test } from 'node:test'
import assert from 'node:assert'
import { mock } from 'bun:test'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as configLib from './config.js'
import * as httpLib from './http.js'

let token: string | null = null
let linked: string | null = null
let fabricDown: 'refused' | 'http' | null = null
const fabricCalls: { name: string; data: any }[] = []

void mock.module('./config.js', () => ({
  ...configLib,
  resolveApiContext: async (opts: { resolveProject?: boolean } = {}) => ({
    apiUrl: 'https://fabric.test',
    apiUrlSource: 'flag',
    token,
    projectId: null,
    project: null,
  }),
}))

void mock.module('./http.js', () => ({
  ...httpLib,
  getFabricRPC: () => ({
    invoke: async (name: string, data: any) => {
      fabricCalls.push({ name, data })
      if (fabricDown === 'refused') throw new Error('connect ECONNREFUSED')
      if (fabricDown === 'http')
        throw Object.assign(new Error('forbidden'), { status: 403 })
      if (name === 'createChange')
        return { change: { changeId: 'fab_1', shortId: '1', title: data.title } }
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
const { next } = await import('../../functions/commands/next.js')
const { knowledgeGaps } = await import('../../functions/commands/knowledge-gaps.js')

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
  fabricDown = null
  delete process.env.FABRIC_PROJECT_ID
  delete process.env.PIKKU_CHANGES_DIR
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

  test('being signed in does not link a project', async () => {
    token = 'tok'
    const { change } = await file('Signed in, unlinked')
    const { changes } = await list()
    assert.ok(changes.some((c: any) => c.changeId === change.changeId))
    assert.strictEqual(fabricCalls.length, 0)
  })

  test('the host decides where the local file lives', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'changes-host-'))
    process.env.PIKKU_CHANGES_DIR = join(dir, 'nested')
    await file('In the host folder')
    const store = JSON.parse(
      await readFile(join(dir, 'nested', 'pikku-changes.json'), 'utf8')
    )
    assert.ok(store.changes.some((c: any) => c.title === 'In the host folder'))
  })

  test('knowledge gaps works on a local project without calling fabric', async () => {
    await knowledgeGaps.func({ config: { rootDir: repo } } as any, {} as any)
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

describe('changes on a project backed by fabric', () => {
  const countLocal = async () => {
    const path = join(repo, '.git', 'pikku-changes.json')
    return JSON.parse(await readFile(path, 'utf8')).changes.length
  }

  test('writes and reads go to fabric only', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    const before = await countLocal()
    await file('Fabric one')
    await list()
    const created = fabricCalls.find((c) => c.name === 'createChange')!
    assert.strictEqual(created.data.title, 'Fabric one')
    assert.ok(fabricCalls.some((c) => c.name === 'listChanges'))
    assert.strictEqual(await countLocal(), before)
  })

  test('the project id in pikku.config.json links it', async () => {
    token = 'tok'
    await writeFile(
      join(repo, 'pikku.config.json'),
      JSON.stringify({ fabric: { projectId: 'proj_cfg' } })
    )
    try {
      await list()
      const call = fabricCalls.find((c) => c.name === 'listChanges')!
      assert.strictEqual(call.data.projectId, 'proj_cfg')
    } finally {
      await rm(join(repo, 'pikku.config.json'))
    }
  })

  test('without a sign-in it refuses and writes nothing', async () => {
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    const before = await countLocal()
    await assert.rejects(file('No sign-in'), /backed by Fabric.*signed in/s)
    assert.strictEqual(fabricCalls.length, 0)
    assert.strictEqual(await countLocal(), before)
  })

  test('when fabric cannot be reached it refuses, and never falls back to the local file', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    fabricDown = 'refused'
    const before = await countLocal()
    await assert.rejects(file('Offline'), /need a connection/)
    await assert.rejects(list(), /need a connection/)
    assert.strictEqual(await countLocal(), before)
  })

  test('an answer from fabric, even an error, is passed through as it is', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    fabricDown = 'http'
    await assert.rejects(file('Forbidden'), /forbidden/)
  })

  test('knowledge gaps reads the list from fabric, not the local file', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    await knowledgeGaps.func({ config: { rootDir: repo } } as any, {} as any)
    const call = fabricCalls.find((c) => c.name === 'listChanges')!
    assert.strictEqual(call.data.projectId, 'proj_1')
  })

  test('next picks from fabric, not the local file', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    await next.func({ config: { rootDir: repo } } as any, {} as any)
    assert.ok(
      fabricCalls.some(
        (c) => c.name === 'listChanges' && c.data.projectId === 'proj_1'
      )
    )
  })

  test('both refuse when fabric cannot be reached', async () => {
    token = 'tok'
    process.env.FABRIC_PROJECT_ID = 'proj_1'
    fabricDown = 'refused'
    await assert.rejects(
      knowledgeGaps.func({ config: { rootDir: repo } } as any, {} as any),
      /need a connection/
    )
    await assert.rejects(
      next.func({ config: { rootDir: repo } } as any, {} as any),
      /need a connection/
    )
  })
})

