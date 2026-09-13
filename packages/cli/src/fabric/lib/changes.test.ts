import { describe, test } from 'node:test'
import assert from 'node:assert'
import {
  age,
  idList,
  imageContentType,
  remaining,
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
