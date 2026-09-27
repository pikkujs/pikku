import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { telemetryInner, telemetryOuter } from './telemetry.js'

const capture = () => {
  const rows: Record<string, any>[] = []
  return {
    rows,
    services: { logger: { info: (row: Record<string, any>) => rows.push(row) } } as any,
  }
}

const wire = { traceId: 'trace-1', wireType: 'http', wireId: 'getThing' } as any

describe('telemetry middleware', () => {
  for (const [name, factory] of [
    ['outer', telemetryOuter],
    ['inner', telemetryInner],
  ] as const) {
    test(`${name} records the stack of a thrown Error`, async () => {
      const { rows, services } = capture()
      const error = new Error('boom')

      await assert.rejects(
        factory()(services, wire, async () => {
          throw error
        }),
      )

      assert.equal(rows.length, 1)
      assert.equal(rows[0]!.outcome, 'error')
      assert.equal(rows[0]!.errorMessage, 'boom')
      assert.equal(rows[0]!.errorStack, error.stack)
    })

    test(`${name} omits the stack when nothing threw`, async () => {
      const { rows, services } = capture()

      await factory()(services, wire, async () => {})

      assert.equal(rows[0]!.outcome, 'ok')
      assert.ok(!('errorStack' in rows[0]!))
    })

    test(`${name} records a thrown non-Error without a stack`, async () => {
      const { rows, services } = capture()

      await assert.rejects(
        factory()(services, wire, async () => {
          throw 'plain string'
        }),
      )

      assert.equal(rows[0]!.errorMessage, 'plain string')
      assert.ok(!('errorStack' in rows[0]!))
    })
  }
})
