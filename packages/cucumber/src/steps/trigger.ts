import assert from 'node:assert/strict'
import type { IFunctionWorld } from '../world.js'
import type { CucumberStepApi } from './common.js'

export function registerTriggerSteps(cucumber: CucumberStepApi): void {
  // ── Given: configure trigger wire before the call ─────────────────────────
  cucumber.Given('the trigger is wired', function (this: IFunctionWorld) {
    this.nextTriggerConfig = true
  })

  // ── Then: assert on trigger invocations ───────────────────────────────────
  cucumber.Then('the trigger was invoked', function (this: IFunctionWorld) {
    const stub = this.lastTriggerWire
    assert.ok(stub, 'no trigger wire was set up for this call')
    assert.ok(
      stub.invocations.length > 0,
      'expected trigger.invoke() to have been called, but it was not'
    )
  })

  cucumber.Then(
    'the trigger was invoked {int} time(s)',
    function (this: IFunctionWorld, count: number) {
      const stub = this.lastTriggerWire
      assert.ok(stub, 'no trigger wire was set up for this call')
      assert.equal(
        stub.invocations.length,
        count,
        `expected trigger to be invoked ${count} time(s) but got ${stub.invocations.length}`
      )
    }
  )

  cucumber.Then('the trigger was not invoked', function (this: IFunctionWorld) {
    const stub = this.lastTriggerWire
    assert.ok(stub, 'no trigger wire was set up for this call')
    assert.equal(
      stub.invocations.length,
      0,
      `expected trigger not to be invoked but got ${stub.invocations.length} invocation(s)`
    )
  })
}
