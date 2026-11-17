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

  test('the follow-up text says what filing does: ready and built next when serial, backlog alongside other builders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'next-'))
    const rpc = localChangesRPC(join(root, 'q.json'))
    await rpc.invoke('createChange', { stageId: 'local', title: 'A page' })
    const serial = await pick(root, rpc, 'local', false)
    assert.match(serial.context!, /filed ready and built by the next agent/)
    assert.doesNotMatch(serial.context!, /backlog/)
    const parallel = await pick(root, rpc, 'local', true)
    assert.match(
      parallel.context!,
      /goes to the backlog[^.]*ready; it is not built in this run/
    )
    process.env.PIKKU_CHANGES_PARALLEL = '1'
    try {
      const marked = await pick(root, rpc, 'local', false)
      assert.match(marked.context!, /goes to the backlog/)
    } finally {
      delete process.env.PIKKU_CHANGES_PARALLEL
    }
  })
})
