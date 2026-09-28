import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (errors: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: () => {},
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-webhook-'))
  const files: string[] = []
  for (const [name, source] of Object.entries(sources)) {
    const file = join(rootDir, name)
    await writeFile(file, source)
    files.push(file)
  }
  const errors: string[] = []
  try {
    const state = await inspect(makeLogger(errors), files, { rootDir })
    return { state, errors, files }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const IMPORT = `import { defineWebhook } from '@pikku/core/webhook'\nimport { z } from 'zod'\n`

describe('addWebhook', () => {
  test('records event, title, description and payload shape', async () => {
    const { state, errors, files } = await inspectSources({
      'webhooks.ts':
        IMPORT +
        `export const orderPaid = defineWebhook({ event: 'order.paid', title: 'Order paid', description: 'Sent when a customer pays', payload: z.object({ orderId: z.string(), total: z.number() }) })\n`,
    })

    assert.deepEqual(errors, [])
    assert.deepEqual(state.webhooks, [
      {
        file: files[0]!,
        variable: 'orderPaid',
        event: 'order.paid',
        title: 'Order paid',
        description: 'Sent when a customer pays',
        payload: { orderId: 'z.string()', total: 'z.number()' },
      },
    ])
  })

  test('matches an aliased import', async () => {
    const { state } = await inspectSources({
      'webhooks.ts':
        `import { defineWebhook as hook } from '@pikku/core/webhook'\n` +
        `export const a = hook({ event: 'a', title: 'A', payload: {} as never })\n`,
    })

    assert.equal(state.webhooks?.[0]?.event, 'a')
    assert.equal(state.webhooks?.[0]?.payload, undefined)
  })

  test('ignores a local helper of the same name', async () => {
    const { state } = await inspectSources({
      'webhooks.ts':
        `const defineWebhook = (x: unknown) => x\n` +
        `export const a = defineWebhook({ event: 'a', title: 'A', payload: {} })\n`,
    })

    assert.equal(state.webhooks, undefined)
  })

  test('refuses a declaration the module does not export', async () => {
    const { state, errors } = await inspectSources({
      'webhooks.ts':
        IMPORT +
        `const hidden = defineWebhook({ event: 'a', title: 'A', payload: z.object({}) })\n`,
    })

    assert.equal(state.webhooks, undefined)
    assert.match(errors[0]!, /does not export/)
  })

  test('refuses a non-literal event', async () => {
    const { state, errors } = await inspectSources({
      'webhooks.ts':
        IMPORT +
        `const name = 'a'\nexport const a = defineWebhook({ event: name, title: 'A', payload: z.object({}) })\n`,
    })

    assert.equal(state.webhooks, undefined)
    assert.match(errors[0]!, /string literals/)
  })

  test('refuses the same event declared twice', async () => {
    const { state, errors } = await inspectSources({
      'a.ts':
        IMPORT +
        `export const a = defineWebhook({ event: 'dup', title: 'A', payload: z.object({}) })\n`,
      'b.ts':
        IMPORT +
        `export const b = defineWebhook({ event: 'dup', title: 'B', payload: z.object({}) })\n`,
    })

    assert.equal(state.webhooks?.length, 1)
    assert.match(errors[0]!, /declared twice/)
  })
})
