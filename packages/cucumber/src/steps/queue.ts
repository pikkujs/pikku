import assert from 'node:assert/strict'
import type { IFunctionWorld } from '../world.js'
import type { CucumberStepApi } from './common.js'

export function registerQueueSteps(cucumber: CucumberStepApi): void {
  // ── Given: configure queue wire before the call ───────────────────────────
  cucumber.Given(
    'the queue job is on queue {string}',
    function (this: IFunctionWorld, queueName: string) {
      this.nextQueueConfig = { queueName }
    }
  )

  cucumber.Given(
    'the queue job is on queue {string} with id {string}',
    function (this: IFunctionWorld, queueName: string, jobId: string) {
      this.nextQueueConfig = { queueName, jobId }
    }
  )

  // ── Then: assert on what happened during the job ──────────────────────────
  cucumber.Then(
    'the job progress was updated to {int}',
    function (this: IFunctionWorld, expected: number) {
      const stub = this.lastQueueWire
      assert.ok(stub, 'no queue wire was set up for this call')
      assert.ok(
        stub.progressUpdates.includes(expected),
        `expected progress update of ${expected} but got: [${stub.progressUpdates.join(', ')}]`
      )
    }
  )

  cucumber.Then('the job failed', function (this: IFunctionWorld) {
    const stub = this.lastQueueWire
    assert.ok(stub, 'no queue wire was set up for this call')
    assert.ok(
      stub.failedWith !== undefined,
      'expected the job to have been failed, but fail() was not called'
    )
  })

  cucumber.Then(
    'the job failed with {string}',
    function (this: IFunctionWorld, reason: string) {
      const stub = this.lastQueueWire
      assert.ok(stub, 'no queue wire was set up for this call')
      assert.equal(
        stub.failedWith,
        reason,
        `expected job to fail with "${reason}" but got "${stub.failedWith}"`
      )
    }
  )

  cucumber.Then('the job was discarded', function (this: IFunctionWorld) {
    const stub = this.lastQueueWire
    assert.ok(stub, 'no queue wire was set up for this call')
    assert.ok(
      stub.discardedWith !== undefined,
      'expected the job to have been discarded, but discard() was not called'
    )
  })
}
