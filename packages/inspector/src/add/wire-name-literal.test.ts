import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

describe('wiring name must be a string literal', () => {
  test('logs a critical error when a queue worker name is a const reference', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-nonliteral-name-'))
    const file = join(rootDir, 'queue.ts')

    await writeFile(
      file,
      [
        "import { pikkuSessionlessFunc, wireQueueWorker } from '@pikku/core'",
        'const QUEUE_NAME = "stripe-webhook-event"',
        'export const handler = pikkuSessionlessFunc({',
        '  func: async () => ({ ok: true })',
        '})',
        'wireQueueWorker({',
        '  name: QUEUE_NAME,',
        '  func: handler,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find(
        (entry) => entry.code === ErrorCode.NON_LITERAL_WIRE_NAME
      )
      assert.ok(hit, 'expected NON_LITERAL_WIRE_NAME critical')
      assert.match(hit!.message, /QUEUE_NAME/)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('logs a critical error when a secret id is a const reference', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-nonliteral-secret-'))
    const file = join(rootDir, 'secret.ts')

    await writeFile(
      file,
      [
        "import { wireSecret } from '@pikku/core'",
        'const SECRET_ID = "STRIPE_SECRET_KEY"',
        'wireSecret({',
        '  secretId: SECRET_ID,',
        "  name: 'Stripe secret key',",
        "  displayName: 'Stripe secret key',",
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find(
        (entry) => entry.code === ErrorCode.NON_LITERAL_WIRE_NAME
      )
      assert.ok(hit, 'expected NON_LITERAL_WIRE_NAME critical')
      assert.match(hit!.message, /SECRET_ID/)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  test('does not flag a queue worker whose name is an inline literal', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'pikku-literal-name-'))
    const file = join(rootDir, 'queue.ts')

    await writeFile(
      file,
      [
        "import { pikkuSessionlessFunc, wireQueueWorker } from '@pikku/core'",
        'export const handler = pikkuSessionlessFunc({',
        '  func: async () => ({ ok: true })',
        '})',
        'wireQueueWorker({',
        "  name: 'stripe-webhook-event',",
        '  func: handler,',
        '})',
      ].join('\n')
    )

    const criticals: Array<{ code: ErrorCode; message: string }> = []
    try {
      await inspect(makeLogger(criticals), [file], { rootDir })
      const hit = criticals.find(
        (entry) => entry.code === ErrorCode.NON_LITERAL_WIRE_NAME
      )
      assert.equal(hit, undefined)
    } finally {
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
