import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger, InspectorOptions } from '../types.js'

const makeLogger = (errors: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: (_code: string, message: string) => {
      errors.push(message)
    },
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const inspectSources = async (
  sources: Record<string, string>,
  options: InspectorOptions = {}
) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-incoming-webhook-'))
  const files: string[] = []
  for (const [name, source] of Object.entries(sources)) {
    const file = join(rootDir, name)
    await writeFile(file, source)
    files.push(file)
  }
  const errors: string[] = []
  try {
    const state = await inspect(makeLogger(errors), files, {
      rootDir,
      incomingWebhooksWiringFile: join(rootDir, 'webhooks.gen.ts'),
      ...options,
    })
    return { state, errors, files, rootDir }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const source = (extra = '') =>
  `import { pikkuSessionlessFunc } from '@pikku/core'\n` +
  `import { defineIncomingWebhook } from '@pikku/core/webhook'\n` +
  `export const handlePayment = pikkuSessionlessFunc({ func: async () => {} })\n` +
  `export const payments = defineIncomingWebhook({ id: 'payments', func: handlePayment, events: ['charge.refunded'], secret: 'PAY_WEBHOOK_SECRET', needs: ['PAY_KEY'], ${extra} upsert: async () => ({ status: 'unchanged' }) })\n`

describe('addIncomingWebhook', () => {
  test('records the declaration and mounts its route without auth', async () => {
    const { state, errors, rootDir } = await inspectSources({
      'webhooks.ts': source(),
    })

    assert.deepEqual(errors, [])
    assert.deepEqual(state.incomingWebhooksMeta?.payments, {
      id: 'payments',
      localId: 'payments',
      pikkuFuncId: 'handlePayment',
      route: '/webhooks/payments',
      events: ['charge.refunded'],
      secret: 'PAY_WEBHOOK_SECRET',
      needs: { PAY_KEY: 'PAY_KEY' },
      exportedName: 'payments',
      sourceFile: join(rootDir, 'webhooks.ts'),
    })
    const route = state.http.meta.post['/webhooks/payments']
    assert.equal(route?.pikkuFuncId, 'handlePayment')
    assert.equal(route?.auth, false)
    assert.ok(state.http.files.has(join(rootDir, 'webhooks.gen.ts')))
  })

  test('lets the app choose its route', async () => {
    const { state } = await inspectSources({
      'webhooks.ts': source(`route: '/auth/stripe/webhook',`),
    })

    assert.equal(
      state.incomingWebhooksMeta?.payments?.route,
      '/auth/stripe/webhook'
    )
    assert.ok(state.http.meta.post['/auth/stripe/webhook'])
  })

  test('refuses a route in an addon and mounts nothing', async () => {
    const { state, errors } = await inspectSources(
      { 'webhooks.ts': source(`route: '/elsewhere',`) },
      { isAddon: true }
    )

    assert.match(errors[0] ?? '', /an addon cannot/)
    assert.equal(
      state.incomingWebhooksMeta?.payments?.route,
      '/webhooks/payments'
    )
    assert.equal(state.http.meta.post['/webhooks/payments'], undefined)
  })

  test('refuses an id that is not a plain literal', async () => {
    const { state, errors } = await inspectSources({
      'webhooks.ts': source().replace(`id: 'payments'`, `id: 'a/b'`),
    })

    assert.equal(state.incomingWebhooks, undefined)
    assert.match(errors[0] ?? '', /needs 'id'/)
  })
})
