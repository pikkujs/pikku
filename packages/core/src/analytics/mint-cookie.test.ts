import { describe, test } from 'node:test'
import * as assert from 'node:assert'
import { mintCookie, randomDigits } from './mint-cookie.js'

const wireWith = (cookies: Record<string, string> = {}, withResponse = true) => {
  const written: Array<{ name: string; value: string }> = []
  const wire = {
    http: {
      request: { cookie: (name: string) => cookies[name] ?? null },
      ...(withResponse
        ? {
            response: {
              cookie: (name: string, value: string) => {
                written.push({ name, value })
              },
            },
          }
        : {}),
    },
  } as any
  return { wire, written }
}

const cookie = { path: '/' }

describe('mintCookie', () => {
  test('returns the existing cookie without writing one', () => {
    const { wire, written } = wireWith({ pikku_aid: 'already' })

    assert.equal(mintCookie(wire, 'pikku_aid', { cookie }, () => 'fresh'), 'already')
    assert.equal(written.length, 0)
  })

  test('mints and sets one when absent', () => {
    const { wire, written } = wireWith()

    assert.equal(mintCookie(wire, 'pikku_aid', { cookie }, () => 'fresh'), 'fresh')
    assert.deepEqual(written, [{ name: 'pikku_aid', value: 'fresh' }])
  })

  test('mints once per wire, so one visitor is not two people', () => {
    const { wire, written } = wireWith()
    let calls = 0
    const mint = () => `id-${++calls}`

    const first = mintCookie(wire, 'pikku_aid', { cookie }, mint)
    const second = mintCookie(wire, 'pikku_aid', { cookie }, mint)

    assert.equal(first, 'id-1')
    assert.equal(second, 'id-1')
    assert.equal(written.length, 1)
  })

  test('writes nothing where there is no response to write it on', () => {
    const { wire } = wireWith({}, false)

    assert.equal(mintCookie(wire, 'pikku_aid', { cookie }, () => 'fresh'), undefined)
  })

  test('refuses to store before consent, which is the act consent governs', () => {
    const { wire, written } = wireWith()

    const value = mintCookie(
      wire,
      'pikku_aid',
      { cookie, requires: ['analytics'], consent: {} },
      () => 'fresh'
    )

    assert.equal(value, undefined)
    assert.equal(written.length, 0)
  })

  test('requires every purpose, not any of them', () => {
    const { wire } = wireWith()

    assert.equal(
      mintCookie(
        wire,
        '_fbp',
        { cookie, requires: ['ads', 'adUserData'], consent: { ads: true } },
        () => 'fresh'
      ),
      undefined
    )
  })

  test('mints once every required purpose is granted', () => {
    const { wire } = wireWith()

    assert.equal(
      mintCookie(
        wire,
        '_fbp',
        { cookie, requires: ['ads'], consent: { ads: true } },
        () => 'fresh'
      ),
      'fresh'
    )
  })

  test('reads an existing cookie even where consent is absent', () => {
    const { wire } = wireWith({ _fbp: 'already' })

    assert.equal(
      mintCookie(wire, '_fbp', { cookie, requires: ['ads'], consent: {} }, () => 'fresh'),
      'already'
    )
  })
})

describe('randomDigits', () => {
  test('produces the requested number of digits', () => {
    const digits = randomDigits(10)

    assert.equal(digits.length, 10)
    assert.match(digits, /^\d{10}$/)
  })
})
