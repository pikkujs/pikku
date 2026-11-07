import { describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { decideRuntime, nodeTooOldMessage } from './runtime-check.js'

describe('decideRuntime', () => {
  test('bun runs the CLI whatever node version it reports', () => {
    assert.deepEqual(
      decideRuntime({
        bunVersion: '1.4.3',
        nodeVersion: '22.6.0',
        reexecuted: false,
      }),
      { action: 'run' }
    )
  })

  test('node 24 and later run the CLI', () => {
    for (const nodeVersion of ['24.0.0', '24.18.1', '26.11.1']) {
      assert.deepEqual(
        decideRuntime({ nodeVersion, reexecuted: false }),
        { action: 'run' },
        nodeVersion
      )
    }
  })

  test('node older than 24 hands over to bun', () => {
    for (const nodeVersion of ['22.23.2', '20.0.0', '16.16.0']) {
      assert.deepEqual(
        decideRuntime({ nodeVersion, reexecuted: false }),
        { action: 'reexec-bun' },
        nodeVersion
      )
    }
  })

  test('an old node that is already the re-executed child is refused, not looped', () => {
    assert.deepEqual(
      decideRuntime({ nodeVersion: '22.23.2', reexecuted: true }),
      {
        action: 'refuse',
        message: nodeTooOldMessage('22.23.2'),
      }
    )
  })

  test('the refusal names the version and both ways out', () => {
    const message = nodeTooOldMessage('22.23.2')
    assert.match(message, /Node 22\.23\.2/)
    assert.match(message, /Node 24 or later/)
    assert.match(message, /bun/)
  })
})
