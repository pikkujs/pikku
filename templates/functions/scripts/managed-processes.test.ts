import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  shutdownManagedProcesses,
  startManagedProcess,
  type ManagedProcess,
} from './managed-processes.ts'

describe('managed process shutdown', () => {
  test('kills remaining descendants when the parent shell exits first', async () => {
    const managedProcesses: ManagedProcess[] = []
    const cwd = path.resolve(import.meta.dirname, '..')

    startManagedProcess(
      managedProcesses,
      'orphan-test',
      'sh',
      ['-c', 'sleep 60 & exit 0'],
      cwd
    )

    await delay(250)

    const shutdownPromise = shutdownManagedProcesses(managedProcesses, 500)
    await assert.doesNotReject(
      Promise.race([
        shutdownPromise,
        delay(3000).then(() => {
          throw new Error('managed process shutdown timed out')
        }),
      ])
    )
  })
})
