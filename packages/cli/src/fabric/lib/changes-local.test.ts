import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localChangesRPC } from './changes-local.js'

const store = async () =>
  localChangesRPC(join(await mkdtemp(join(tmpdir(), 'changes-')), 'q.json'))

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

  test('says an rpc it cannot serve needs a fabric project', async () => {
    const rpc = await store()
    await assert.rejects(rpc.invoke('listStages', { projectId: 'local' }), {
      status: 501,
    })
  })
})
