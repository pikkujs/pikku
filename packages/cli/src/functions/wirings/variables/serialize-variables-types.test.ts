import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializeVariablesTypes } from './serialize-variables-types.js'
import type { VariableDefinitions } from '@pikku/core/variable'
import type { SchemaRef } from '@pikku/inspector'

const serialize = (
  definitions: VariableDefinitions,
  schemaLookup: Map<string, SchemaRef> = new Map()
) =>
  serializeVariablesTypes({
    definitions,
    schemaLookup,
    variablesFile: '/project/.pikku/variables/pikku-variables.gen.ts',
    packageMappings: {},
  })

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-variables.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

/** Only a schema-backed variable reaches the metadata entries. */
const schemaBackedVariable = (displayName: string) =>
  serialize(
    [
      {
        name: 'apiUrl',
        displayName,
        variableId: 'API_URL',
        schema: 'ApiUrlSchema',
      },
    ],
    new Map([
      [
        'ApiUrlSchema',
        {
          variableName: 'ApiUrlSchema',
          sourceFile: '/project/src/variables.ts',
        } as SchemaRef,
      ],
    ])
  )

describe('serializeVariablesTypes — shipping the declared set', () => {
  // Same reason as secrets: tsc only copies an imported .json into the build
  // output, and an addon publishes only that output.
  test('imports the metadata sidecar so tsc ships it', () => {
    const output = serialize([
      {
        name: 'apiUrl',
        displayName: 'API URL',
        variableId: 'API_URL',
      },
    ])

    assert.match(
      output,
      /import '\.\/pikku-variables-meta\.gen\.json' with \{ type: 'json' \}/
    )
  })

  // The sidecar is read off disk by the host, never imported from the leaf, so
  // binding it to a name would put a symbol nothing calls into
  // `#pikku/variables`.
  test('keeps the sidecar out of the package surface', () => {
    const output = serialize([
      { name: 'apiUrl', displayName: 'API URL', variableId: 'API_URL' },
    ])

    assert.doesNotMatch(output, /export const VARIABLES_META/)
  })

  test('imports the sidecar even when nothing is declared', () => {
    const output = serialize([])

    assert.match(output, /pikku-variables-meta\.gen\.json/)
  })

  test('emits a parseable file for an ordinary display name', () => {
    assert.deepEqual(parseErrors(schemaBackedVariable('API URL')), [])
  })

  /**
   * A display name is prose written by a human — "the tenant's API URL", a
   * Windows path — and interpolated raw into a quoted string it terminates the
   * literal and the whole generated file stops parsing.
   */
  test('emits a parseable file for a display name needing escaping', () => {
    assert.deepEqual(
      parseErrors(schemaBackedVariable(`the tenant's "API" URL \\ prod`)),
      []
    )
  })
})

describe('serializeVariablesTypes — carrying the declared schema', () => {
  // Without the schema as a value in the metadata, a `.default()` in the
  // declaration is unreachable at runtime: the service has no way to ask.
  test('puts the schema on the metadata entry, not just in the type map', () => {
    const output = schemaBackedVariable('API URL')
    assert.match(output, /'API_URL': \{[^}]*schema: \(\) => ApiUrlSchema/)
    assert.deepEqual(parseErrors(output), [])
  })

  // This file and the one declaring the schema import each other, so evaluating
  // the schema at module scope throws before it is initialized.
  test('defers reading the schema, so the import cycle stays harmless', () => {
    const output = schemaBackedVariable('API URL')
    assert.doesNotMatch(output, /schema: ApiUrlSchema/)
  })

  test('imports the schema as a value so the emit keeps it', () => {
    const output = schemaBackedVariable('API URL')
    assert.match(
      output,
      /^import \{ ApiUrlSchema \} from '\.\.\/\.\.\/src\/variables\.js'$/m
    )
  })
})
