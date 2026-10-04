import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localChangesRPC, releaseChangeset } from './changes-local.js'

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

  test('says an rpc it cannot serve needs a fabric project', async () => {
    const rpc = await store()
    await assert.rejects(rpc.invoke('listStages', { projectId: 'local' }), {
      status: 501,
    })
  })
})
