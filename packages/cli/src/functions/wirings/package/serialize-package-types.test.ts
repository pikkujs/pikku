import { test, describe } from 'node:test'
import * as assert from 'assert'
import {
  serializeAnalyticsDefinitionTypes,
  serializeScopeDefinitionTypes,
  serializeSecretDefinitionTypes,
  serializeVariableDefinitionTypes,
} from './serialize-package-types.js'

/**
 * Each definer is generated into the project's own `.pikku` so an app reaches
 * it through `#pikku/<leaf>` rather than naming `@pikku/core` for something the
 * generator already puts in front of it.
 */
describe('definition types', () => {
  test('the secrets leaf carries defineSecret', () => {
    assert.match(
      serializeSecretDefinitionTypes(),
      /export \{ defineSecret \} from '@pikku\/core\/secret'/
    )
  })

  test('the variables leaf carries defineVariable', () => {
    assert.match(
      serializeVariableDefinitionTypes(),
      /export \{ defineVariable \} from '@pikku\/core\/variable'/
    )
  })

  test('the scopes leaf carries defineScope and defineSystemRole', () => {
    const scopes = serializeScopeDefinitionTypes()
    assert.match(scopes, /export \{ defineScope \} from '@pikku\/core\/scope'/)
    assert.match(
      scopes,
      /export \{ defineSystemRole \} from '@pikku\/core\/role'/
    )
  })

  test('the analytics leaf carries defineAnalyticsEvents', () => {
    assert.match(
      serializeAnalyticsDefinitionTypes(),
      /export \{ defineAnalyticsEvents,/
    )
  })

  /**
   * Declaring events is half of what a project does with analytics; the other
   * half is writing the sink they go to, which means naming `AnalyticsService`
   * and the record it is handed. Both halves come through the same door.
   */
  test('the analytics leaf carries the sink surface', () => {
    const analytics = serializeAnalyticsDefinitionTypes()
    for (const name of [
      'AnalyticsService',
      'AnalyticsRecord',
      'AnalyticsIdentity',
      'AnalyticsClientContext',
      'AnalyticsLog',
      'LoggerAnalyticsService',
    ]) {
      assert.ok(
        analytics.includes(name),
        `${name} is not reachable through #pikku/analytics`
      )
    }
  })
})
