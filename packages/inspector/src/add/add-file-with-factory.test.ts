import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { ErrorCode } from '../error-codes.js'
import type { InspectorLogger } from '../types.js'
import {
  serializeInspectorState,
  deserializeInspectorState,
} from '../utils/serialize-inspector-state.js'

const makeLogger = (criticals: Array<{ code: ErrorCode; message: string }>) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    diagnostic: ({ severity, code, message }) => {
      if (severity !== 'warn') {
        criticals.push({ code, message })
      }
    },
    critical: (code: ErrorCode, message: string) => {
      criticals.push({ code, message })
    },
    hasCriticalErrors: () => criticals.length > 0,
  }) satisfies InspectorLogger

const inspectSource = async (prefix: string, source: string) => {
  const rootDir = await mkdtemp(join(tmpdir(), prefix))
  const file = join(rootDir, 'services.ts')
  await writeFile(file, source)
  const criticals: Array<{ code: ErrorCode; message: string }> = []
  try {
    const state = await inspect(makeLogger(criticals), [file], { rootDir })
    return { state, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

describe('pikkuAddonServices — what an addon takes from its parent', () => {
  test('a name destructured in the body, not the parameter list, is still forwarded', async () => {
    const { state } = await inspectSource(
      'pikku-addon-body-destructure-',
      [
        "import { pikkuAddonServices } from '#pikku/addon/setup'",
        'export const createSingletonServices = pikkuAddonServices(',
        '  async (_config, existingServices) => {',
        '    const { kysely, secrets } = existingServices',
        '    return { ...existingServices, stripeApi: makeStripe(secrets) }',
        '  }',
        ')',
      ].join('\n')
    )

    assert.ok(
      state.addonRequiredParentServices.includes('kysely'),
      'kysely is read off the parent bag and must be declared as required'
    )
    assert.deepEqual(state.addonCreatedServices, ['stripeApi'])
    assert.equal(state.addonServicesFactorySeen, true)
  })

  test('an object rest is a binding name, not a service', async () => {
    const { state } = await inspectSource(
      'pikku-addon-object-rest-',
      [
        "import { pikkuAddonServices } from '#pikku/addon/setup'",
        'export const createSingletonServices = pikkuAddonServices(',
        '  async (_config, { kysely, ...parentServices }) => ({',
        '    ...parentServices,',
        '    kysely,',
        '    stripeApi: makeStripe(),',
        '  })',
        ')',
      ].join('\n')
    )

    assert.deepEqual(state.addonRequiredParentServices, ['kysely'])
    assert.ok(
      !state.addonRequiredParentServices.includes('parentServices'),
      'a rest binding names the leftover bag, not a service the parent provides'
    )
  })

  test('a parenthesised return still yields its created services', async () => {
    const { state } = await inspectSource(
      'pikku-addon-parenthesised-return-',
      [
        "import { pikkuAddonServices } from '#pikku/addon/setup'",
        'export const createSingletonServices = pikkuAddonServices(',
        '  async (_config, existingServices) => {',
        '    return ({ ...existingServices, stripeApi: makeStripe() })',
        '  }',
        ')',
      ].join('\n')
    )

    assert.deepEqual(state.addonCreatedServices, ['stripeApi'])
    assert.ok(
      !state.addonRequiredParentServices.includes('stripeApi'),
      'a service the factory builds is not one the parent has to supply'
    )
  })

  test('the addon contract survives a serialize/deserialize round trip', async () => {
    const { state } = await inspectSource(
      'pikku-addon-round-trip-',
      [
        "import { pikkuAddonServices } from '#pikku/addon/setup'",
        'export const createSingletonServices = pikkuAddonServices(',
        '  async (_config, existingServices) => {',
        '    const { kysely } = existingServices',
        '    return { ...existingServices, stripeApi: makeStripe(kysely) }',
        '  }',
        ')',
      ].join('\n')
    )

    const restored = deserializeInspectorState(
      JSON.parse(JSON.stringify(serializeInspectorState(state)))
    )

    assert.deepEqual(
      restored.addonRequiredParentServices,
      state.addonRequiredParentServices
    )
    assert.deepEqual(restored.addonCreatedServices, ['stripeApi'])
    assert.equal(restored.addonServicesFactorySeen, true)
  })
})
