import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeCredentialsTypes } from './serialize-credentials-types.js'
import type { CredentialDefinitions } from '@pikku/core/credential'

const serialize = (definitions: CredentialDefinitions) =>
  serializeCredentialsTypes({
    definitions,
    schemaLookup: new Map(),
    credentialsFile: '/project/.pikku/credentials/pikku-credentials.gen.ts',
    packageMappings: {},
  })

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-credentials.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const credential = (displayName: string): CredentialDefinitions => [
  { name: 'stripe', displayName, type: 'singleton' },
]

describe('serializeCredentialsTypes', () => {
  test('emits a parseable file for an ordinary display name', () => {
    assert.deepEqual(parseErrors(serialize(credential('Stripe'))), [])
  })

  /**
   * A display name is prose written by a human — "Stripe's live key", a Windows
   * path — and interpolated raw into a quoted string it terminates the literal
   * and the whole generated file stops parsing.
   */
  test('emits a parseable file for a display name needing escaping', () => {
    assert.deepEqual(
      parseErrors(serialize(credential(`Stripe's "live" key \\ prod`))),
      []
    )
  })

  // An interface has no implicit index signature, so `CredentialsMap` was not
  // assignable to the `Record<string, unknown>` that `GetCredential` is
  // constrained by — every generated project reported the same two errors on
  // its own function types. A type alias carries one.
  test('the credentials map is a type alias, so it satisfies Record<string, unknown>', () => {
    const source = serialize(credential('Stripe'))

    assert.match(source, /export type CredentialsMap = \{/)
    assert.doesNotMatch(source, /export interface CredentialsMap/)
  })

  /**
   * An addon registers its credential meta from its package file. A project
   * has no package file, so without this its own credentials are absent from
   * pikku state and `wire.getCredential` cannot tell a singleton from a wire
   * credential for anything the project declared itself.
   */
  test('registers the project meta into pikku state', () => {
    const source = serializeCredentialsTypes({
      definitions: credential('Stripe'),
      schemaLookup: new Map(),
      credentialsFile: '/project/.pikku/credentials/pikku-credentials.gen.ts',
      packageMappings: {},
      registerAppMeta: true,
    })

    assert.match(source, /import \{ pikkuState \} from '@pikku\/core\/state'/)
    assert.match(
      source,
      /pikkuState\(null, 'package', 'credentialsMeta', CREDENTIALS_META\)/
    )
    assert.deepEqual(parseErrors(source), [])
  })

  test('an addon file registers nothing, its package file already does', () => {
    assert.doesNotMatch(serialize(credential('Stripe')), /pikkuState/)
  })
})
