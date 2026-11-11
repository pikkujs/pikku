import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializeProductHooks } from './serialize-product-hooks.js'

const ANALYTICS = '../../../scaffold/analytics/analytics.gen.js'
const FLAGS = './contract/scopes/pikku-flags.gen.js'

describe('serializeProductHooks', () => {
  test('emits both hooks when events and flags are declared', () => {
    const output = serializeProductHooks({
      analyticsPath: ANALYTICS,
      flagsPath: FLAGS,
    })
    assert.ok(
      output.includes(
        "import { useFeatureFlag, usePikkuAnalytics } from '@pikku/react'"
      )
    )
    assert.ok(
      output.includes(`import type { AnalyticsEvent } from '${ANALYTICS}'`)
    )
    assert.ok(
      output.includes(`import type { FeatureFlagName } from '${FLAGS}'`)
    )
    assert.ok(
      output.includes(
        'export const useAnalytics = () => usePikkuAnalytics<AnalyticsEvent>()'
      )
    )
    assert.ok(output.includes('export const useFlag = (name: FeatureFlagName)'))
  })

  test('emits only useAnalytics when no flags are declared', () => {
    const output = serializeProductHooks({ analyticsPath: ANALYTICS })
    assert.ok(output.includes('export const useAnalytics ='))
    assert.ok(!output.includes('useFlag'))
    assert.ok(!output.includes('useFeatureFlag'))
    assert.ok(!output.includes('FeatureFlagName'))
    assert.ok(
      output.includes("import { usePikkuAnalytics } from '@pikku/react'")
    )
  })

  test('emits only useFlag when no events are declared', () => {
    const output = serializeProductHooks({ flagsPath: FLAGS })
    assert.ok(output.includes('export const useFlag ='))
    assert.ok(!output.includes('useAnalytics'))
    assert.ok(!output.includes('usePikkuAnalytics'))
    assert.ok(!output.includes('AnalyticsEvent'))
    assert.ok(output.includes("import { useFeatureFlag } from '@pikku/react'"))
  })

  test('is deterministic', () => {
    const options = { analyticsPath: ANALYTICS, flagsPath: FLAGS }
    assert.strictEqual(
      serializeProductHooks(options),
      serializeProductHooks(options)
    )
  })
})
