import { test, describe } from 'node:test'
import * as assert from 'assert'
import {
  serializeCredentialDefinitionTypes,
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
  test('the credentials leaf carries defineCredential', () => {
    assert.match(
      serializeCredentialDefinitionTypes(),
      /export \{ defineCredential \} from '@pikku\/core\/credential'/
    )
  })

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
})
