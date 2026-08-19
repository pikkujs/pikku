import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializePersonasSecrets } from './serialize-personas-secrets.js'

describe('serializePersonasSecrets', () => {
  test('declares SCENARIO_ACTOR_SECRET so the platform collects it', () => {
    const content = serializePersonasSecrets()

    assert.match(content, /defineSecret\(\{/)
    assert.match(content, /secretId: 'SCENARIO_ACTOR_SECRET'/)
    assert.match(content, /name: 'scenarioActorSecret'/)
    assert.match(content, /displayName: '[^']+'/)
  })

  test('is optional, because a stage that runs no scenarios is supported', () => {
    const content = serializePersonasSecrets()

    assert.match(content, /optional: true,/)
  })

  test('schema is a variable reference, which is what the inspector accepts', () => {
    const content = serializePersonasSecrets()

    assert.match(
      content,
      /export const ScenarioActorSecretSchema = z\.string\(\)/
    )
    assert.match(content, /schema: ScenarioActorSecretSchema,/)
    assert.doesNotMatch(content, /schema: z\./)
  })

  test('imports only what a marker file needs', () => {
    const content = serializePersonasSecrets()

    assert.match(
      content,
      /import \{ defineSecret \} from '@pikku\/core\/secret'/
    )
    assert.match(content, /import \{ z \} from 'zod'/)
    assert.doesNotMatch(content, /wireHTTP/)
  })
})
