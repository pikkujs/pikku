import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

const makeLogger = (errors: string[], criticals: string[]) =>
  ({
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: (_code: unknown, message: string) => {
      criticals.push(message)
    },
    hasCriticalErrors: () => false,
  }) as unknown as InspectorLogger

const inspectSources = async (sources: Record<string, string>) => {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-add-feature-flag-'))
  const files: string[] = []
  for (const [name, source] of Object.entries(sources)) {
    const file = join(rootDir, name)
    await writeFile(file, source)
    files.push(file)
  }
  const errors: string[] = []
  const criticals: string[] = []
  try {
    const state = await inspect(makeLogger(errors, criticals), files, {
      rootDir,
    })
    return { state, errors, criticals }
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
}

const names = (state: Awaited<ReturnType<typeof inspectSources>>['state']) =>
  state.featureFlags.definitions.map((definition) => definition.name).sort()

describe('addFeatureFlag', () => {
  test('collects a declaration written directly', async () => {
    const { state } = await inspectSources({
      'flags.ts':
        `import { defineFeatureFlags } from '@pikku/core/flag'\n` +
        `export const flags = defineFeatureFlags({\n` +
        `  newCheckout: { description: 'The new checkout', anyOf: ['billing:write'] },\n` +
        `})\n`,
    })

    assert.deepEqual(names(state), ['newCheckout'])
    const [flag] = state.featureFlags.definitions
    assert.equal(flag?.description, 'The new checkout')
    assert.deepEqual(flag?.anyOf, ['billing:write'])
  })

  test('finds the declaration through a local alias', async () => {
    const { state } = await inspectSources({
      'flags.ts':
        `import { defineFeatureFlags as declare } from '@pikku/core/flag'\n` +
        `export const flags = declare({ newCheckout: { anyOf: ['billing:write'] } })\n`,
    })

    assert.deepEqual(names(state), ['newCheckout'])
  })

  test('ignores a same-named local helper', async () => {
    const { state } = await inspectSources({
      'flags.ts':
        `const defineFeatureFlags = (flags: Record<string, unknown>) => flags\n` +
        `export const flags = defineFeatureFlags({ newCheckout: { anyOf: ['billing:write'] } })\n`,
    })

    assert.deepEqual(names(state), [])
  })

  test('keeps a shorthand property, with the body declared above', async () => {
    const { state, criticals } = await inspectSources({
      'flags.ts':
        `import { defineFeatureFlags } from '@pikku/core/flag'\n` +
        `const newCheckout = { description: 'The new checkout', anyOf: ['billing:write'] }\n` +
        `export const flags = defineFeatureFlags({ newCheckout })\n`,
    })

    assert.deepEqual(criticals, [])
    assert.deepEqual(names(state), ['newCheckout'])
    const [flag] = state.featureFlags.definitions
    assert.deepEqual(flag?.anyOf, ['billing:write'])
    assert.equal(flag?.description, 'The new checkout')
  })

  test('follows a named property to the variable holding its body', async () => {
    const { state } = await inspectSources({
      'flags.ts':
        `import { defineFeatureFlags } from '@pikku/core/flag'\n` +
        `const body = { anyOf: ['billing:write'] }\n` +
        `export const flags = defineFeatureFlags({ newCheckout: body })\n`,
    })

    assert.deepEqual(names(state), ['newCheckout'])
    assert.deepEqual(state.featureFlags.definitions[0]?.anyOf, [
      'billing:write',
    ])
  })

  test('refuses a body it cannot read rather than dropping the constraint', async () => {
    const { state, criticals } = await inspectSources({
      'flags.ts':
        `import { defineFeatureFlags } from '@pikku/core/flag'\n` +
        `declare const bodies: Record<string, { anyOf: string[] }>\n` +
        `export const flags = defineFeatureFlags({ newCheckout: bodies.a! })\n`,
    })

    assert.deepEqual(names(state), [])
    assert.equal(criticals.length, 1)
    assert.match(criticals[0]!, /must be an object literal/)
  })
})
