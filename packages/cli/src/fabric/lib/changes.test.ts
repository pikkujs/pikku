import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  age,
  idList,
  imageContentType,
  remaining,
  requireProjectId,
  resolveChangeId,
} from './changes.js'
import type { PikkuRPC } from '../sdk/pikku-rpc.gen.js'

describe('idList', () => {
  test('reads a comma-separated flag', () => {
    assert.deepStrictEqual(idList(['a,b']), ['a', 'b'])
  })

  test('reads a repeated flag the same way', () => {
    assert.deepStrictEqual(idList(['a', 'b']), ['a', 'b'])
  })

  test('drops the empties a shell loop leaves behind', () => {
    assert.deepStrictEqual(idList(['a, ,b,']), ['a', 'b'])
  })

  test('says nothing rather than an empty list', () => {
    assert.strictEqual(idList([]), undefined)
    assert.strictEqual(idList([',']), undefined)
  })
})

describe('requireProjectId', () => {
  test('passes a linked project through', () => {
    assert.strictEqual(requireProjectId('proj_1'), 'proj_1')
  })

  test('names both ways out when there is none', () => {
    assert.throws(
      () => requireProjectId(null),
      /--project-id[\s\S]*fabric link/
    )
  })
})

describe('age and remaining', () => {
  const minutesFromNow = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000)

  test('an age is how long ago', () => {
    assert.strictEqual(age(minutesFromNow(-5)), '5m')
    assert.strictEqual(age(minutesFromNow(-120)), '2h')
    assert.strictEqual(age(minutesFromNow(-60 * 48)), '2d')
  })

  test('a lease reads as the time it has left', () => {
    assert.strictEqual(remaining(minutesFromNow(30)), '30m')
    assert.strictEqual(remaining(minutesFromNow(180)), '3h')
  })

  test('an expired lease is over, not negative', () => {
    assert.strictEqual(remaining(minutesFromNow(-30)), '0m')
  })
})

describe('imageContentType', () => {
  test('reads the type off the extension, in any case', () => {
    assert.strictEqual(imageContentType('shot.png'), 'image/png')
    assert.strictEqual(imageContentType('/tmp/a/shot.JPG'), 'image/jpeg')
    assert.strictEqual(imageContentType('shot.jpeg'), 'image/jpeg')
    assert.strictEqual(imageContentType('shot.webp'), 'image/webp')
  })

  test('says nothing when the name says nothing', () => {
    assert.strictEqual(imageContentType('shot'), undefined)
    assert.strictEqual(imageContentType('shot.gif'), undefined)
  })
})

describe('resolveChangeId', () => {
  const UUID = '0f3c8a12-9b44-4d2e-8f01-27c6a1d9e5b3'
  const listed: boolean[] = []
  const rpc = {
    invoke: async (_name: string, data: { includeDone: boolean }) => {
      listed.push(data.includeDone)
      return {
        changes: data.includeDone
          ? [
              { shortId: '2', changeId: UUID },
              { shortId: '9', changeId: 'done-9' },
            ]
          : [{ shortId: '2', changeId: UUID }],
      }
    },
  } as unknown as PikkuRPC

  test('2 and #2 both name the change', async () => {
    assert.strictEqual(await resolveChangeId(rpc, 'p1', '2'), UUID)
    assert.strictEqual(await resolveChangeId(rpc, 'p1', '#2'), UUID)
  })

  test('a uuid goes straight through without a lookup', async () => {
    listed.length = 0
    assert.strictEqual(await resolveChangeId(rpc, 'p1', UUID), UUID)
    assert.deepStrictEqual(listed, [])
  })

  test('falls back to closed items', async () => {
    assert.strictEqual(await resolveChangeId(rpc, 'p1', '#9'), 'done-9')
  })

  test('refuses a short id with no project to look in', async () => {
    await assert.rejects(resolveChangeId(rpc, null, '#2'), /uuid/)
  })

  test('says so when no change has that number', async () => {
    await assert.rejects(resolveChangeId(rpc, 'p1', '#40'), /No change #40/)
  })
})
