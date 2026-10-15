import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localChangesRPC } from '../lib/changes-local.js'
import { pick } from './next.function.js'

describe('next with a backlog', () => {
  test('is idle when the only open changes are backlogged', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-'))
    const rpc = localChangesRPC(join(root, 'q.json'))
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Later',
      backlog: true,
    })
    const route = await pick(root, rpc, 'local', false)
    assert.strictEqual(route.agent, null)
    assert.notStrictEqual(route.agent, 'changes')

    await (rpc.invoke as Function)('moveChange', { changeId: '1', to: 'ready' })
    const after = await pick(root, rpc, 'local', false)
    assert.strictEqual(after.agent, 'changes')
  })
})
