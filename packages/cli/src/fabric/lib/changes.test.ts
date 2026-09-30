import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  age,
  idList,
  imageContentType,
  remaining,
  changeRef,
  clockTime,
  requireProjectId,
} from './changes.js'

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

describe('changeRef', () => {
  const UUID = '0f3c8a12-9b44-4d2e-8f01-27c6a1d9e5b3'

  test('2 and #2 go to fabric with the project to look them up in', () => {
    assert.deepStrictEqual(changeRef('p1', '2'), {
      changeId: '2',
      projectId: 'p1',
    })
    assert.deepStrictEqual(changeRef('p1', ' #2 '), {
      changeId: '#2',
      projectId: 'p1',
    })
  })

  test('a uuid goes alone, so it works from any directory', () => {
    assert.deepStrictEqual(changeRef('p1', UUID), { changeId: UUID })
    assert.deepStrictEqual(changeRef(null, UUID), { changeId: UUID })
  })

  test('refuses a short id with no project to look in', () => {
    assert.throws(() => changeRef(null, '#2'), /uuid/)
  })
})

describe('clockTime', () => {
  test('is the local wall-clock hour and minute', () => {
    const at = new Date(2026, 8, 29, 9, 5, 42)
    assert.strictEqual(clockTime(at), '09:05')
    assert.strictEqual(clockTime(at.toISOString()), '09:05')
  })
})
