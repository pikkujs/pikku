import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createInvocationAudit,
  type AuditEvent,
  type AuditEventBatch,
} from './audit-service.js'

describe('audit-service', () => {
  test('best-effort flush failures are logged and do not throw', async () => {
    const warnings: unknown[][] = []
    const audit = createInvocationAudit(
      {
        async audit(_event: AuditEvent): Promise<void> {
          throw new Error('should not use single-event write')
        },
        async write(_batch: AuditEventBatch): Promise<void> {
          throw new Error('sink failed')
        },
      },
      {
        wireType: 'rpc',
        wireId: 'wire-best-effort',
        functionId: 'bestEffortFunc',
        audit: { durability: 'best-effort' },
        logger: {
          warn: (...args: unknown[]) => warnings.push(args),
        },
      } as any
    )

    await audit.write({
      type: 'db.query',
      source: 'auto',
      queryId: 'q-1',
    })

    await assert.doesNotReject(async () => {
      await audit.close()
    })
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0]?.[0], 'best-effort audit flush failed')
  })
})
