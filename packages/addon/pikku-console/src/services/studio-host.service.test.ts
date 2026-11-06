import assert from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { LocalChangesStore, resolveStudioHost } from './studio-host.service.js'

const root = () => mkdtemp(join(tmpdir(), 'pikku-console-studio-'))

describe('LocalChangesStore', () => {
  test('creates, moves and completes a change on disk', async () => {
    const dir = await root()
    const store = new LocalChangesStore(dir)
    const change = await store.create({ title: 'Bigger logo', route: '/' })
    assert.equal(change.status, 'open')
    await store.setStatus(change.changeId, 'in_progress')
    await store.complete(change.changeId, 'Done')
    const again = new LocalChangesStore(dir)
    assert.equal((await again.get(change.changeId))?.status, 'done')
    assert.deepEqual(await again.list(['open']), [])
  })

  test('refuses an unknown change', async () => {
    const store = new LocalChangesStore(await root())
    await assert.rejects(store.setStatus('nope', 'open'))
  })
})

describe('resolveStudioHost', () => {
  test('is local when nothing links the project to Pikku Studio Cloud', async () => {
    const host = await resolveStudioHost(await root())
    assert.equal(host.mode, 'local')
    assert.equal(host.projectId, null)
  })
})
