import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localChangesRPC, releaseChangeset } from './changes-local.js'
import { claimable } from './changes-next.js'
import { board, statuses } from './changes-board.js'

const tempStore = async () =>
  join(await mkdtemp(join(tmpdir(), 'changes-')), 'q.json')
const store = async () => localChangesRPC(await tempStore())

describe('local changes queue', () => {
  test('files, claims, refuses a second claim, and completes', async () => {
    const rpc = await store()
    const a = await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    await rpc.invoke('createChange', { stageId: 'local', title: 'B' })
    assert.strictEqual(a.change.shortId, '1')

    const claimed = await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1', '#2'],
      claimedBy: 'me',
    })
    assert.strictEqual(claimed.changes.length, 2)

    const again = await rpc.invoke('claimChanges', {
      projectId: 'local',
      groupId: claimed.group.groupId,
      changeIds: ['1', '2'],
      claimedBy: 'me',
    })
    assert.strictEqual(again.group.title, claimed.group.title)

    await assert.rejects(
      rpc.invoke('claimChanges', {
        projectId: 'local',
        changeIds: ['1'],
        claimedBy: 'other',
      }),
      { status: 409 }
    )

    await rpc.invoke('completeChange', { changeId: '2', note: 'done' })
    const open = await rpc.invoke('listChanges', { projectId: 'local' })
    assert.deepStrictEqual(
      open.changes.map((c) => c.title),
      ['A']
    )
    const { thread } = await rpc.invoke('getChange', { changeId: '2' })
    assert.strictEqual(thread[0]?.body, 'done')
  })

  test('runs one schema changeset at a time and holds readers of a new table', async () => {
    const path = await tempStore()
    const rpc = localChangesRPC(path)
    for (const title of ['Waitlist', 'Cancel', 'Copy', 'Join list'])
      await rpc.invoke('createChange', { stageId: 'local', title })
    const claim = (changeId: string, d: Record<string, string[]>) =>
      rpc.invoke('claimChanges', {
        projectId: 'local',
        changeIds: [changeId],
        claimedBy: 'me',
        ...d,
      })

    const waitlist = await claim('1', { creates: ['waitlist'] })
    await assert.rejects(claim('2', { alters: ['class'] }), { status: 409 })
    await assert.rejects(claim('4', { reads: ['waitlist'] }), { status: 409 })
    await claim('3', { reads: ['class'] })

    await releaseChangeset(path, waitlist.group.groupId)
    await claim('2', { alters: ['class'] })
  })

  test('says an rpc it cannot serve needs a cloud project', async () => {
    const rpc = await store()
    await assert.rejects(rpc.invoke('listStages', { projectId: 'local' }), {
      status: 501,
    })
  })

  const move = (rpc: Awaited<ReturnType<typeof store>>, to: string, id = '1') =>
    (rpc.invoke as Function)('moveChange', { changeId: id, to })
  const ready = async (rpc: Awaited<ReturnType<typeof store>>) =>
    board(
      await rpc.invoke('listChanges', {
        projectId: 'local',
        status: statuses('ready', 'in_progress'),
      })
    )

  test('a backlogged change is tracked but never picked up', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Later',
      backlog: true,
    })
    await rpc.invoke('createChange', { stageId: 'local', title: 'Now' })

    const all = await rpc.invoke('listChanges', { projectId: 'local' })
    assert.deepStrictEqual(
      all.changes.map((c) => c.status),
      ['backlog', 'ready']
    )
    assert.deepStrictEqual(
      claimable(await ready(rpc), Date.now()).map((c) => c.title),
      ['Now']
    )

    const claimed = await rpc.invoke('claimChanges', {
      projectId: 'local',
      claimedBy: 'me',
    })
    assert.deepStrictEqual(
      claimed.changes.map((c) => c.title),
      ['Now']
    )

    await assert.rejects(
      rpc.invoke('claimChanges', {
        projectId: 'local',
        changeIds: ['1'],
        claimedBy: 'me',
      }),
      { status: 409, message: '#1 is in the backlog; run `pikku changes ready 1` first' }
    )
    await assert.rejects(
      rpc.invoke('claimChanges', { projectId: 'local', claimedBy: 'me' }),
      { status: 409 }
    )
  })

  test('ready moves a backlog change into the queue', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Later',
      backlog: true,
    })
    const moved = await move(rpc, 'ready')
    assert.strictEqual(moved.change.status, 'ready')
    assert.strictEqual(claimable(await ready(rpc), Date.now()).length, 1)
    const claimed = await rpc.invoke('claimChanges', {
      projectId: 'local',
      changeIds: ['1'],
      claimedBy: 'me',
    })
    assert.strictEqual(claimed.changes.length, 1)
  })

  test('claiming leaves the status alone; the claim lives on the group', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    const claimed = await rpc.invoke('claimChanges', {
      projectId: 'local',
      claimedBy: 'me',
    })
    const list = board(await rpc.invoke('listChanges', { projectId: 'local' }))
    assert.strictEqual(list.changes[0]!.status, 'ready')
    assert.strictEqual(list.changes[0]!.groupId, claimed.group.groupId)
    assert.strictEqual(list.groups[0]!.claimedBy, 'me')
    assert.strictEqual(claimable(list, Date.now()).length, 0)
  })

  test('start, backlog and ready move a change between columns', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    assert.strictEqual((await move(rpc, 'in_progress')).change.status, 'in_progress')
    assert.strictEqual((await move(rpc, 'backlog')).change.status, 'backlog')
    assert.strictEqual((await move(rpc, 'ready')).change.status, 'ready')
  })

  test('refuses the moves a status does not allow', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'A',
      backlog: true,
    })
    await assert.rejects(move(rpc, 'in_progress'), {
      status: 409,
      message: '#1 is in the backlog; run `pikku changes ready 1` first',
    })
    await rpc.invoke('createChange', { stageId: 'local', title: 'B' })
    await move(rpc, 'in_progress', '2')
    await assert.rejects(move(rpc, 'ready', '2'), {
      status: 409,
      message: '#2 is in_progress; only a backlog change can be made ready',
    })
    await rpc.invoke('completeChange', { changeId: '2' })
    for (const to of ['in_progress', 'backlog', 'ready'])
      await assert.rejects(move(rpc, to, '2'), {
        status: 409,
        message: '#2 is done',
      })
  })

  test('in progress with a lapsed lease is abandoned and claimable again', async () => {
    const path = await tempStore()
    const rpc = localChangesRPC(path)
    await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    const claimed = await rpc.invoke('claimChanges', {
      projectId: 'local',
      claimedBy: 'me',
    })
    await move(rpc, 'in_progress')
    assert.strictEqual(claimable(await ready(rpc), Date.now()).length, 0)
    await releaseChangeset(path, claimed.group.groupId)
    const list = await ready(rpc)
    assert.strictEqual(list.changes[0]!.status, 'in_progress')
    assert.strictEqual(claimable(list, Date.now()).length, 1)
    const again = await rpc.invoke('claimChanges', {
      projectId: 'local',
      claimedBy: 'other',
    })
    assert.strictEqual(again.changes.length, 1)
  })

  test('migrates a store written with open, claimed and the backlog flag', async () => {
    const path = await tempStore()
    const row = (shortId: string, extra: object) => ({
      changeId: `id${shortId}`,
      shortId,
      projectId: 'local',
      title: `T${shortId}`,
      createdAt: new Date().toISOString(),
      groupId: null,
      ...extra,
    })
    await writeFile(
      path,
      JSON.stringify({
        nextShortId: 5,
        changes: [
          row('1', { status: 'open' }),
          row('2', { status: 'claimed', groupId: 'g' }),
          row('3', { status: 'open', backlog: true }),
          row('4', { status: 'in_progress', backlog: false }),
        ],
        groups: [
          {
            groupId: 'g',
            projectId: 'local',
            title: 'G',
            claimedBy: 'me',
            claimExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        messages: [],
      })
    )
    const rpc = localChangesRPC(path)
    const { changes } = await rpc.invoke('listChanges', { projectId: 'local' })
    assert.deepStrictEqual(
      changes.map((c) => c.status as string),
      ['ready', 'ready', 'backlog', 'in_progress']
    )
    assert.strictEqual(changes[1]!.groupId, 'g')
    assert.ok(changes.every((c) => !('backlog' in c)))
    const saved = JSON.parse(await readFile(path, 'utf8'))
    assert.ok(saved.changes.every((c: object) => !('backlog' in c)))
  })

  test('ask records a question, shot a visual, and only a person reply clears it', async () => {
    const rpc = await store()
    await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    await rpc.invoke('createChange', { stageId: 'local', title: 'B' })
    await rpc.invoke('askChangeQuestion', {
      changeId: '1',
      question: 'Which?',
      authorName: 'me',
    } as any)
    await rpc.invoke('attachChangeShot', {
      changeId: '2',
      label: 'Option A',
      authorName: 'me',
    } as any)
    const asks = async () =>
      (await rpc.invoke('listChanges', { projectId: 'local' })).changes.map(
        (c) => [c.status as string, (c as any).ask?.kind, (c as any).ask?.askedBy]
      )
    assert.deepStrictEqual(await asks(), [
      ['needs_answer', 'question', 'me'],
      ['needs_answer', 'visual', 'me'],
    ])
    await rpc.invoke('replyToChange', {
      changeId: '1',
      body: 'Still thinking',
      authorName: 'me',
    } as any)
    assert.deepStrictEqual((await asks())[0], ['needs_answer', 'question', 'me'])
    await rpc.invoke('replyToChange', {
      changeId: '1',
      body: 'Go with A',
      authorName: 'person',
      person: true,
    } as any)
    assert.deepStrictEqual((await asks())[0], ['in_progress', undefined, undefined])
    const thread = await rpc.invoke('getChange', { changeId: '1' })
    assert.deepStrictEqual(
      thread.thread.map((m) => m.authorKind),
      ['agent', 'agent', 'user']
    )
  })

  test('migration gives a needs_answer row without ask the question kind', async () => {
    const path = await tempStore()
    await writeFile(
      path,
      JSON.stringify({
        nextShortId: 2,
        changes: [
          {
            changeId: 'a',
            shortId: '1',
            projectId: 'local',
            title: 'T',
            status: 'needs_answer',
            groupId: null,
            createdAt: new Date().toISOString(),
          },
        ],
        groups: [],
        messages: [],
      })
    )
    const { changes } = await localChangesRPC(path).invoke('listChanges', {
      projectId: 'local',
    })
    assert.strictEqual((changes[0] as any).ask.kind, 'question')
  })
})
