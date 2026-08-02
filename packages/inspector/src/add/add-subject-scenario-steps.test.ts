/**
 * The two step kinds whose subject is not a person: the app acting on itself,
 * and a third-party system acting on it.
 *
 * What is being pinned here is mostly negative — that neither can declare a
 * surface, and that both are marked in a way the virtual-user catalogue can
 * refuse. The second is not tidiness: a virtual user that could invoke "Stripe's
 * webhook arrives" would forge its own payment success, and every finding
 * downstream of that is worthless.
 */
import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from '../inspector.js'
import type { InspectorLogger } from '../types.js'

async function run(source: string) {
  const rootDir = await mkdtemp(join(tmpdir(), 'pikku-subject-step-'))
  const file = join(rootDir, 'subjects.steps.ts')
  await writeFile(file, source)
  const errors: string[] = []
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: string) => {
      errors.push(message)
    },
    diagnostic: () => {},
    critical: (_code: any, message: string) => {
      errors.push(message)
    },
    hasCriticalErrors: () => false,
  } as unknown as InspectorLogger

  const state = await inspect(logger, [file], { rootDir })
  return {
    state,
    errors,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  }
}

const IMPORTS =
  "import { pikkuPlatformScenarioStep, pikkuAddonScenarioStep } from '@pikku/core/workflow'"

describe('pikkuPlatformScenarioStep', () => {
  test('registers under its declared name, marked as the platform acting', async () => {
    const { state, errors, cleanup } = await run(
      [
        IMPORTS,
        'export const trialHasExpired = pikkuPlatformScenarioStep({',
        "  name: 'trialHasExpired',",
        "  description: 'the platform has expired the trial',",
        '  func: async ({ logger }, data: { orgId: string }) => ({ ok: !!data.orgId }),',
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(errors, [])
      const meta = state.functions.meta['trialHasExpired']
      assert.ok(meta, 'expected a function registered as trialHasExpired')
      assert.equal(meta.scenarioStepKind, 'platform')
      // Held out of every deployed unit, exactly like a persona step.
      assert.equal(meta.scenarioStep, true)
      assert.equal(state.rpc.exposedMeta['trialHasExpired'], undefined)
      assert.equal(state.rpc.internalMeta['trialHasExpired'], undefined)
    } finally {
      await cleanup()
    }
  })

  test('has exactly one witness: a surface binding is refused', async () => {
    const { state, errors, cleanup } = await run(
      [
        IMPORTS,
        'export const trialHasExpired = pikkuPlatformScenarioStep({',
        "  name: 'trialHasExpired',",
        '  browser: async ({ logger }) => ({ ok: true }),',
        '})',
      ].join('\n')
    )
    try {
      assert.ok(
        errors.some((message) => message.includes('browser')),
        `expected the browser binding to be refused, got: ${errors.join(' | ')}`
      )
      assert.equal(state.functions.meta['trialHasExpired'], undefined)
    } finally {
      await cleanup()
    }
  })

  test('declares one surface, so a browser run never demands an actor for it', async () => {
    const { state, cleanup } = await run(
      [
        IMPORTS,
        'export const trialHasExpired = pikkuPlatformScenarioStep({',
        "  name: 'trialHasExpired',",
        '  func: async ({ logger }) => ({ ok: true }),',
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(
        state.functions.meta['trialHasExpired']?.scenarioStepSurfaces,
        ['default']
      )
    } finally {
      await cleanup()
    }
  })
})

describe('pikkuAddonScenarioStep', () => {
  test('records the addon whose system acts', async () => {
    const { state, errors, cleanup } = await run(
      [
        IMPORTS,
        'export const stripeWebhookArrives = pikkuAddonScenarioStep({',
        "  name: 'stripeWebhookArrives',",
        "  addon: 'stripe',",
        "  template: 'Stripe sends {event}',",
        '  func: async ({ logger }, data: { event: string }) => ({ ok: !!data.event }),',
        '})',
      ].join('\n')
    )
    try {
      assert.deepEqual(errors, [])
      const meta = state.functions.meta['stripeWebhookArrives']
      assert.equal(meta?.scenarioStepKind, 'addon')
      assert.equal(meta?.scenarioStepAddon, 'stripe')
      assert.equal(meta?.scenarioStepTemplate, 'Stripe sends {event}')
    } finally {
      await cleanup()
    }
  })

  test('without an addon it is refused — nobody can say whose system acted', async () => {
    const { state, errors, cleanup } = await run(
      [
        IMPORTS,
        'export const stripeWebhookArrives = pikkuAddonScenarioStep({',
        "  name: 'stripeWebhookArrives',",
        '  func: async ({ logger }) => ({ ok: true }),',
        '})',
      ].join('\n')
    )
    try {
      assert.ok(
        errors.some((message) => message.includes('addon')),
        `expected a missing-addon error, got: ${errors.join(' | ')}`
      )
      assert.equal(state.functions.meta['stripeWebhookArrives'], undefined)
    } finally {
      await cleanup()
    }
  })
})
