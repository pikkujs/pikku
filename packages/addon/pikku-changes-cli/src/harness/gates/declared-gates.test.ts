import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { planPathFor, PLAN_VERSION } from '@pikku/knowledge'
import { localChangesRPC } from '../../lib/changes-local.js'
import { createGateWire } from '../gate.js'
import { gitIn } from '../git.js'
import { removeThrowaways, throwawayRepo } from '../test-support.js'
import { migrationGate } from './migration.js'
import { planGate } from './plan.js'

after(removeThrowaways)

/** A repo on a changeset branch with `titles` filed and claimed as one changeset on its local queue. */
const setup = async (
  titles: string[],
  declaration: {
    creates?: string[]
    alters?: string[]
    needsPlan?: boolean
  } = {}
) => {
  const repo = await throwawayRepo()
  const store = join(repo, '.git', 'pikku-changes.json')
  const rpc = localChangesRPC(store)
  const changes = []
  for (const title of titles)
    changes.push(
      (await rpc.invoke('createChange', { projectId: 'local', title } as never))
        .change
    )
  const { group } = await rpc.invoke('claimChanges', {
    projectId: 'local',
    changeIds: changes.map((c) => c.changeId),
    claimedBy: 'test',
    ...declaration,
  } as never)
  const git = gitIn(repo)
  await git(['checkout', '-q', '-b', 'changeset/1'])
  const commit = async (files: Record<string, string>, subject: string) => {
    for (const [path, content] of Object.entries(files)) {
      await mkdir(dirname(join(repo, path)), { recursive: true })
      await writeFile(join(repo, path), content)
    }
    await git(['add', '-A'])
    await git(['commit', '-q', '-m', subject])
  }
  const wire = createGateWire({
    worktree: repo,
    base: 'main',
    attempt: 1,
    changeId: changes.at(-1)!.changeId,
    scratch: join(repo, '.git'),
  })
  const items = changes.map((c) => ({
    shortId: String(c.shortId),
    changeId: c.changeId,
  }))
  return { repo, store, rpc, group, items, commit, wire }
}

describe('migrationGate', () => {
  test('a migration added by an undeclared changeset is a finding that says how to declare it; declared, it passes', async () => {
    const h = await setup(['One'])
    const gate = migrationGate({
      changeset: h.group.groupId,
      items: h.items,
      storePath: h.store,
    })
    await h.commit({ 'src/a.ts': 'export {}\n' }, 'feat: #1 code only')
    assert.deepEqual(await gate.run(h.wire), [])
    await h.commit(
      { 'db/migrations/0001_entry.sql': 'create table entry ();\n' },
      'feat: #1 entry table'
    )
    const [finding, ...rest] = await gate.run(h.wire)
    assert.equal(rest.length, 0)
    assert.equal(finding!.file, 'db/migrations/0001_entry.sql')
    assert.equal(finding!.severity, 'high')
    assert.equal(finding!.rule, 'harness/migration-declaration')
    assert.match(
      finding!.message,
      /#1 adds db\/migrations\/0001_entry\.sql but its changeset declared no table it creates or alters/
    )
    assert.match(
      finding!.message,
      new RegExp(
        `pikku changes claim --group-id ${h.group.groupId} --change-ids 1 --creates <tables> --alters <tables>`
      )
    )
    assert.match(finding!.message, /the checks run after you stop/)
    await h.rpc.invoke('claimChanges', {
      projectId: 'local',
      groupId: h.group.groupId,
      changeIds: [h.items[0]!.changeId],
      claimedBy: 'test',
      creates: ['entry'],
    } as never)
    assert.deepEqual(await gate.run(h.wire), [])
  })
})

const plan = (changeset: string) => ({
  version: PLAN_VERSION,
  changeset,
  surface: 'app',
  description: 'One function.',
  covers: [{ note: 'entities/entry.md', hash: 'abcdef12', complete: true }],
  model: { kind: 'n/a', description: 'No tables.' },
  functions: {
    kind: 'built',
    description: 'One.',
    items: [
      {
        name: 'createEntry',
        description: 'Creates an entry.',
        pass: 1,
        scopes: [],
        permission: null,
      },
    ],
  },
  roles: { kind: 'n/a', description: 'None.' },
  scopes: { kind: 'n/a', description: 'None.' },
  ui: { kind: 'n/a', description: 'None.' },
  scenarios: {
    backend: { kind: 'n/a', description: 'None.' },
    browser: { kind: 'n/a', description: 'None.' },
    permission: { kind: 'n/a', description: 'None.' },
  },
})

describe('planGate', () => {
  test('a changeset that needs no plan passes', async () => {
    const h = await setup(['One'])
    assert.deepEqual(
      await planGate({
        changeset: h.group.groupId,
        items: h.items,
        storePath: h.store,
      }).run(h.wire),
      []
    )
  })

  test('a planned changeset with no plan on its branch is a finding that says how to write it', async () => {
    const h = await setup(['One'], { needsPlan: true })
    const [finding] = await planGate({
      changeset: h.group.groupId,
      items: h.items,
      storePath: h.store,
    }).run(h.wire)
    assert.equal(finding!.rule, 'harness/plan')
    assert.equal(finding!.file, planPathFor(h.group.groupId))
    assert.match(finding!.message, /This changeset needs a plan and has none/)
    assert.match(
      finding!.message,
      new RegExp(`pikku knowledge plan set ${h.group.groupId} <file>`)
    )
    assert.match(finding!.message, /the checks run after you stop/)
  })

  test('the plan only has to be there before the last change; for the last one it has to be built', async () => {
    const h = await setup(['One', 'Two'], { needsPlan: true })
    const path = planPathFor(h.group.groupId)
    await h.commit(
      { [path]: JSON.stringify(plan(h.group.groupId)) },
      'docs: plan'
    )
    // building #1 of two: the plan is there, which is enough
    assert.deepEqual(
      await planGate({
        changeset: h.group.groupId,
        items: [h.items[0]!],
        storePath: h.store,
      }).run(h.wire),
      []
    )
    // building the last open change: its first pass must be in the generated meta
    const last = planGate({
      changeset: h.group.groupId,
      items: h.items,
      storePath: h.store,
    })
    const [finding] = await last.run(h.wire)
    assert.match(
      finding!.message,
      /This is the last change of a planned changeset and the plan is not built yet/
    )
    assert.match(finding!.message, /missing .*createEntry/)
    assert.match(finding!.message, /the checks run after you stop/)
    await mkdir(join(h.repo, '.pikku', 'function'), { recursive: true })
    await writeFile(
      join(h.repo, '.pikku', 'function', 'pikku-functions-meta.gen.json'),
      JSON.stringify({ createEntry: { pikkuFuncId: 'createEntry' } })
    )
    assert.deepEqual(await last.run(h.wire), [])
  })

  test('a plan that does not read is a finding', async () => {
    const h = await setup(['One'], { needsPlan: true })
    await h.commit({ [planPathFor(h.group.groupId)]: '{ nope' }, 'docs: plan')
    const [finding] = await planGate({
      changeset: h.group.groupId,
      items: h.items,
      storePath: h.store,
    }).run(h.wire)
    assert.match(
      finding!.message,
      /its plan does not read: .*is not valid JSON/
    )
  })
})
