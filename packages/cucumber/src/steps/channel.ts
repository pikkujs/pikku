import assert from 'node:assert/strict'
import type { IFunctionWorld } from '../world.js'
import type { CucumberStepApi } from './common.js'

type TableLike = { rowsHash: () => Record<string, string> }

function tableToObject(table: TableLike): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(table.rowsHash())) {
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      value = raw
    }
    out[key] = value
  }
  return out
}

export function registerChannelSteps(cucumber: CucumberStepApi): void {
  // ── Given: configure channel wire before the call ─────────────────────────
  cucumber.Given('the channel is open', function (this: IFunctionWorld) {
    this.nextChannelConfig = {}
  })

  cucumber.Given(
    'the channel is open with id {string}',
    function (this: IFunctionWorld, channelId: string) {
      this.nextChannelConfig = { channelId }
    }
  )

  // ── Then: assert on what was sent ─────────────────────────────────────────
  cucumber.Then(
    'the channel sent {int} message(s)',
    function (this: IFunctionWorld, count: number) {
      const stub = this.lastChannelWire
      assert.ok(stub, 'no channel wire was set up for this call')
      assert.equal(
        stub.sentMessages.length,
        count,
        `expected ${count} channel message(s) but got ${stub.sentMessages.length}`
      )
    }
  )

  cucumber.Then(
    'the channel sent a message with:',
    function (this: IFunctionWorld, table: TableLike) {
      const stub = this.lastChannelWire
      assert.ok(stub, 'no channel wire was set up for this call')
      const expected = tableToObject(table)
      const match = stub.sentMessages.some((msg) => {
        if (typeof msg !== 'object' || msg === null) return false
        return Object.entries(expected).every(
          ([k, v]) => String((msg as Record<string, unknown>)[k]) === String(v)
        )
      })
      assert.ok(
        match,
        `expected a channel message matching ${JSON.stringify(expected)} but got:\n  ${stub.sentMessages.map((m) => JSON.stringify(m)).join('\n  ')}`
      )
    }
  )

  cucumber.Then('the channel was closed', function (this: IFunctionWorld) {
    const stub = this.lastChannelWire
    assert.ok(stub, 'no channel wire was set up for this call')
    assert.ok(stub.isClosed, 'expected the channel to have been closed')
  })

  cucumber.Then('the channel was not closed', function (this: IFunctionWorld) {
    const stub = this.lastChannelWire
    assert.ok(stub, 'no channel wire was set up for this call')
    assert.ok(!stub.isClosed, 'expected the channel to remain open')
  })
}
