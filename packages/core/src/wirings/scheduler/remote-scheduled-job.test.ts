import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { BadRequestError } from '../../errors/errors.js'
import { resetPikkuState, setSingletonServices } from '../../pikku-state.js'
import { pikkuRemoteScheduledJobFunc } from './remote-scheduled-job.js'

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any

describe('pikkuRemoteScheduledJobFunc', () => {
  test('acks a task this deployment does not have rather than asking for a retry', async () => {
    resetPikkuState()
    setSingletonServices({ logger: silentLogger } as any)
    await assert.rejects(
      pikkuRemoteScheduledJobFunc(
        { logger: silentLogger },
        {
          taskName: 'not-a-task',
        }
      ),
      BadRequestError
    )
  })
})
