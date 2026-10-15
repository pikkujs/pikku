import { describe, test } from 'node:test'
import assert from 'node:assert'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inferSpecialist, nextSpecialist, specialistOf } from './specialists.js'
import { assertDependencies, runnable } from './change-order.js'
import { localChangesRPC } from './changes-local.js'

const store = async () =>
  localChangesRPC(join(await mkdtemp(join(tmpdir(), 'spec-')), 'q.json'))

describe('specialist inference', () => {
  test('reads the words and falls back to build', () => {
    assert.strictEqual(inferSpecialist('Reword the welcome email'), 'emails')
    assert.strictEqual(
      inferSpecialist('Add a knowledge note for tips'),
      'knowledge'
    )
    assert.strictEqual(
      inferSpecialist('Make the booking button green'),
      'frontend'
    )
    assert.strictEqual(
      inferSpecialist('Sketch a mockup of the rota'),
      'artifacts'
    )
    assert.strictEqual(inferSpecialist('Fix the thing'), 'build')
  })

  test('a page that needs backend work is build', () => {
    assert.strictEqual(
      inferSpecialist('New page listing bookings from a new table'),
      'build'
    )
  })

  test('an explicit tag wins over the words', () => {
    assert.strictEqual(
      specialistOf({ title: 'Reword the email', specialist: 'build' }),
      'build'
    )
    assert.strictEqual(specialistOf({ title: 'Reword the email' }), 'emails')
  })

  test('build goes first, then the declared order', () => {
    assert.strictEqual(
      nextSpecialist([
        { title: 'a', specialist: 'emails' },
        { title: 'b', specialist: 'build' },
      ]),
      'build'
    )
    assert.strictEqual(
      nextSpecialist([
        { title: 'a', specialist: 'emails' },
        { title: 'b', specialist: 'frontend' },
      ]),
      'frontend'
    )
    assert.strictEqual(nextSpecialist([]), null)
  })
})

describe('dependencies', () => {
  const a = { changeId: 'a', dependsOn: [] as string[] }
  const b = { changeId: 'b', dependsOn: ['a'] }

  test('rejects unknown ids', () => {
    assert.throws(() => assertDependencies([a], 'c', ['zzz']), /not a change/)
  })

  test('rejects self and cycles', () => {
    assert.throws(() => assertDependencies([a], 'a', ['a']), /cycle/)
    assert.throws(() => assertDependencies([a, b], 'a', ['b']), /cycle/)
    assertDependencies([a, b], 'c', ['b'])
  })

  test('a change is runnable only when its dependencies are finished', () => {
    const all = [
      { changeId: 'a', status: 'open' },
      { changeId: 'b', status: 'open', dependsOn: ['a'] },
    ]
    assert.deepStrictEqual(
      runnable([all[0]!, all[1]!], all).map((c) => c.changeId),
      ['a']
    )
    all[0]!.status = 'done'
    assert.deepStrictEqual(
      runnable([all[1]!], all).map((c) => c.changeId),
      ['b']
    )
  })
})

describe('local store', () => {
  test('tags, infers and resolves short ids in depends_on', async () => {
    const rpc = await store()
    const a = await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Reword the welcome email',
    })
    const b = await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'Use it on sign-up',
      specialist: 'build',
      dependsOn: ['#1'],
    } as any)
    assert.strictEqual((a.change as any).specialist, 'emails')
    assert.strictEqual((b.change as any).specialist, 'build')
    assert.deepStrictEqual((b.change as any).dependsOn, [a.change.changeId])
  })

  test('refuses unknown ids, unknown specialists and cycles', async () => {
    const rpc = await store()
    const a = await rpc.invoke('createChange', { stageId: 'local', title: 'A' })
    await rpc.invoke('createChange', {
      stageId: 'local',
      title: 'B',
      dependsOn: ['1'],
    } as any)
    await assert.rejects(
      rpc.invoke('createChange', {
        stageId: 'local',
        title: 'C',
        dependsOn: ['99'],
      } as any),
      { status: 404 }
    )
    await assert.rejects(
      rpc.invoke('createChange', {
        stageId: 'local',
        title: 'C',
        specialist: 'plumber',
      } as any),
      { status: 400 }
    )
    await assert.rejects(
      (rpc as any).invoke('updateChange', {
        changeId: a.change.changeId,
        dependsOn: ['2'],
      }),
      { status: 400 }
    )
  })
})
