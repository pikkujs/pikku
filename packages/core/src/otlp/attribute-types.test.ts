import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { AttributeTypes } from './attribute-types.js'

describe('AttributeTypes', () => {
  test('allow-list keys start with their fixed type', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ 'http.response.status_code': 200.4 }), {
      'http.response.status_code': 200,
    })
    assert.deepEqual(types.coerce({ 'pikku.function.id': 12 }), {
      'pikku.function.id': '12',
    })
  })

  test('a key that is not allow-listed is dropped and counted', () => {
    const types = new AttributeTypes()
    assert.deepEqual(
      types.coerce({
        'pikku.function.id': 'f',
        password: 'x',
        'pikku.other': 1,
      }),
      { 'pikku.function.id': 'f' }
    )
    assert.equal(types.dropped, 2)
  })

  test('the new boundary keys are allow-listed', () => {
    const types = new AttributeTypes()
    assert.deepEqual(
      types.coerce({
        'messaging.system': 'pikku',
        'messaging.destination.name': 'q',
        'rpc.service': 'deployment',
      }),
      {
        'messaging.system': 'pikku',
        'messaging.destination.name': 'q',
        'rpc.service': 'deployment',
      }
    )
    assert.equal(types.dropped, 0)
  })

  test('the network client keys are allow-listed with fixed types', () => {
    const types = new AttributeTypes()
    assert.deepEqual(
      types.coerce({
        'server.address': 'api.stripe.com',
        'server.port': 443,
        'pikku.network.rule': '*.stripe.com',
        'pikku.network.blocked': false,
      }),
      {
        'server.address': 'api.stripe.com',
        'server.port': 443,
        'pikku.network.rule': '*.stripe.com',
        'pikku.network.blocked': false,
      }
    )
    assert.equal(types.dropped, 0)
    assert.deepEqual(
      types.coerce({
        'server.address': 10,
        'server.port': 8443.2,
        'pikku.network.blocked': 'true',
      }),
      { 'server.address': '10', 'server.port': 8443 }
    )
    assert.equal(types.dropped, 1)
  })

  test('the URL, its path and its query never leave on a span', () => {
    const types = new AttributeTypes()
    assert.deepEqual(
      types.coerce({
        'server.address': 'api.example.com',
        'url.full': 'https://api.example.com/v1/users?token=abc',
        'url.path': '/v1/users',
        'url.query': 'token=abc',
        'url.scheme': 'https',
        'http.request.header.authorization': 'Bearer abc',
      }),
      { 'server.address': 'api.example.com' }
    )
    assert.equal(types.dropped, 5)
  })

  test('a key under the db. plugin prefix keeps the type it was first seen with', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ 'db.n': 1 }), { 'db.n': 1 })
    assert.deepEqual(types.coerce({ 'db.n': 2.7 }), { 'db.n': 3 })
    assert.deepEqual(types.coerce({ 'db.n': '5' }), {})
    assert.equal(types.dropped, 1)
  })

  test('a prefix no plugin owns is not a plugin key', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ 'myplugin.n': 1, 'xdb.n': 1 }), {})
    assert.equal(types.dropped, 2)
  })

  test('a whole number into a double column stays a double', () => {
    const types = new AttributeTypes()
    types.coerce({ 'db.ratio': 0.5 })
    assert.deepEqual(types.coerce({ 'db.ratio': 2 }), {
      'db.ratio': { double: 2 },
    })
  })

  test('anything becomes a string where a string was first', () => {
    const types = new AttributeTypes()
    types.coerce({ 'db.label': 'a' })
    assert.deepEqual(types.coerce({ 'db.label': true }), {
      'db.label': 'true',
    })
    assert.deepEqual(types.coerce({ 'db.label': 4 }), { 'db.label': '4' })
  })

  test('a bool column refuses a non-bool instead of inventing one', () => {
    const types = new AttributeTypes()
    types.coerce({ 'db.flag': true })
    assert.deepEqual(types.coerce({ 'db.flag': 'yes' }), {})
    assert.equal(types.dropped, 1)
  })

  test('a non-finite number is dropped', () => {
    const types = new AttributeTypes()
    assert.deepEqual(types.coerce({ 'db.n': Number.NaN }), {})
    assert.equal(types.dropped, 1)
  })

  test('keys built from data stop being tracked after 512', () => {
    const types = new AttributeTypes()
    for (let n = 0; n < 600; n++) types.coerce({ [`db.k${n}`]: 1 })
    assert.ok(types.dropped > 0)
  })

  test('an event keeps exception.type and exception.message only, and counts the rest', () => {
    const types = new AttributeTypes()
    const out = types.events([
      {
        name: 'exception',
        attributes: {
          'exception.type': 'Error',
          'exception.message': 'm',
          'exception.stacktrace': 'at x',
          other: 'x',
        },
      },
    ])
    assert.deepEqual(out[0]!.attributes, {
      'exception.type': 'Error',
      'exception.message': 'm',
    })
    assert.equal(types.dropped, 2)
  })

  test('an event whose name is not a short identifier is dropped whole', () => {
    const types = new AttributeTypes()
    assert.deepEqual(
      types.events([
        { name: 'Has Space' },
        { name: 'a'.repeat(65) },
        { name: 'ok.event_1' },
      ]),
      [{ name: 'ok.event_1', attributes: {} }]
    )
    assert.equal(types.dropped, 2)
  })
})
