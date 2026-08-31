import { test, describe } from 'node:test'
import * as assert from 'assert'
import { PikkuError } from '../../errors/error-handler.js'
import { formatCLIError, wantsStackTrace } from './format-cli-error.js'

describe('formatCLIError', () => {
  test('prints an expected error as its message alone', () => {
    const error = new PikkuError(
      "Persona 'guest' missing guest. Refusing to run."
    )
    assert.strictEqual(
      formatCLIError(error),
      "Persona 'guest' missing guest. Refusing to run."
    )
  })

  test('prints an error flagged as expected as its message alone', () => {
    const error = Object.assign(new Error('token expired'), { expected: true })
    assert.strictEqual(formatCLIError(error), 'token expired')
  })

  test('keeps the stack for an unexpected error', () => {
    const error = new TypeError('cannot read properties of undefined')
    const output = formatCLIError(error)
    assert.ok(output.includes('TypeError: cannot read properties of undefined'))
    assert.ok(output.includes('at '))
  })

  test('does not double the error name', () => {
    const output = formatCLIError(new Error('boom'))
    assert.ok(!output.includes('Error: Error:'))
    assert.ok(output.startsWith('Error: boom'))
  })

  test('adds the stack to an expected error when verbose', () => {
    const error = new PikkuError('nope')
    const output = formatCLIError(error, { verbose: true })
    assert.ok(output.startsWith('nope\n'))
    assert.ok(output.includes('at '))
  })

  test('summarises a fetch failure without inspecting the response', () => {
    const error = Object.assign(new Error('Bad Gateway'), {
      status: 502,
      statusText: 'Bad Gateway',
      response: {
        url: 'https://api.pikkufabric.com/rpc/getDeploymentStatus',
        headers: { forbidden: 'do not print me' },
        body: 'a stream',
      },
    })
    assert.strictEqual(
      formatCLIError(error),
      '502 Bad Gateway from https://api.pikkufabric.com/rpc/getDeploymentStatus'
    )
  })

  test('keeps a fetch failure message that says more than the status', () => {
    const error = Object.assign(new Error('Deployment not found'), {
      status: 404,
      statusText: 'Not Found',
      response: { url: 'https://api.pikkufabric.com/rpc/getDeploymentStatus' },
    })
    assert.strictEqual(
      formatCLIError(error),
      'Deployment not found\n' +
        '  404 Not Found from https://api.pikkufabric.com/rpc/getDeploymentStatus'
    )
  })

  test('falls back to a string for a thrown non-error', () => {
    assert.strictEqual(formatCLIError('just a string'), 'just a string')
  })
})

describe('wantsStackTrace', () => {
  test('is off by default', () => {
    assert.strictEqual(wantsStackTrace(['deploy'], {}), false)
  })

  test('honours --verbose and -v', () => {
    assert.strictEqual(wantsStackTrace(['deploy', '--verbose'], {}), true)
    assert.strictEqual(wantsStackTrace(['deploy', '-v'], {}), true)
  })

  test('honours PIKKU_DEBUG, but not when it is switched off', () => {
    assert.strictEqual(wantsStackTrace(['deploy'], { PIKKU_DEBUG: '1' }), true)
    assert.strictEqual(wantsStackTrace(['deploy'], { PIKKU_DEBUG: '0' }), false)
    assert.strictEqual(wantsStackTrace(['deploy'], { PIKKU_DEBUG: '' }), false)
  })
})
