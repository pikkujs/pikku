import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { serializeVirtualUsersSecrets } from './serialize-virtual-users-secrets.js'

describe('serializeVirtualUsersSecrets', () => {
  test('declares SCENARIO_VIRTUAL_USER_SECRET so the platform collects it', () => {
    const content = serializeVirtualUsersSecrets()

    assert.match(content, /defineSecret\(\{/)
    assert.match(content, /secretId: 'SCENARIO_VIRTUAL_USER_SECRET'/)
    assert.match(content, /name: 'scenarioVirtualUserSecret'/)
    assert.match(content, /displayName: '[^']+'/)
  })

  test('is optional, because a stage that runs no scenarios is supported', () => {
    const content = serializeVirtualUsersSecrets()

    assert.match(content, /optional: true,/)
  })

  test('schema is a variable reference, which is what the inspector accepts', () => {
    const content = serializeVirtualUsersSecrets()

    assert.match(
      content,
      /export const ScenarioVirtualUserSecretSchema = z\.string\(\)/
    )
    assert.match(content, /schema: ScenarioVirtualUserSecretSchema,/)
    assert.doesNotMatch(content, /schema: z\./)
  })

  test('imports only what a marker file needs', () => {
    const content = serializeVirtualUsersSecrets()

    assert.match(
      content,
      /import \{ defineSecret \} from '@pikku\/core\/secret'/
    )
    assert.match(content, /import \{ z \} from 'zod'/)
    assert.doesNotMatch(content, /wireHTTP/)
  })
})
