import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeAuthTypes } from './serialize-auth-types.js'

const AUTH_TYPES_FILE = '/project/.pikku/auth/auth.types.ts'
const FUNCTION_TYPES_FILE =
  '/project/.pikku/function/pikku-function-types.gen.ts'
const SECRETS_FILE = '/project/.pikku/secrets/pikku-secrets.gen.ts'
const VARIABLES_FILE = '/project/.pikku/variables/pikku-variables.gen.ts'

const gen = () =>
  serializeAuthTypes(
    AUTH_TYPES_FILE,
    FUNCTION_TYPES_FILE,
    SECRETS_FILE,
    VARIABLES_FILE,
    {}
  )

describe('serializeAuthTypes', () => {
  test('imports the generated typed secret/variables service classes', () => {
    const output = gen()
    assert.match(
      output,
      /import { TypedSecretService } from '\.\.\/secrets\/pikku-secrets\.gen\.js'/
    )
    assert.match(
      output,
      /import { TypedVariablesService } from '\.\.\/variables\/pikku-variables\.gen\.js'/
    )
  })

  test('substitutes the typed services into the factory services type', () => {
    const output = gen()
    assert.match(output, /secrets: TypedSecretService/)
    assert.match(output, /variables: TypedVariablesService/)
    assert.match(output, /Omit<SingletonServices, 'secrets' \| 'variables'>/)
  })

  test('wraps the base services in the typed services at runtime', () => {
    const output = gen()
    assert.match(output, /new TypedSecretService\(services\.secrets\)/)
    assert.match(output, /new TypedVariablesService\(services\.variables\)/)
  })

  test('re-exports the typed pikkuBetterAuth bound to the project types', () => {
    const output = gen()
    assert.match(
      output,
      /import { pikkuBetterAuth as _pikkuBetterAuth } from '@pikku\/better-auth'/
    )
    assert.match(output, /export const pikkuBetterAuth =/)
    assert.match(
      output,
      /import type { SingletonServices } from '\.\.\/function\/pikku-function-types\.gen\.js'/
    )
  })
})
