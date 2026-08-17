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
})
