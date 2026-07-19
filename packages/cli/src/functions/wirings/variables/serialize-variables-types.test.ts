import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import { serializeVariablesTypes } from './serialize-variables-types.js'
import type { VariableDefinitions } from '@pikku/core/variable'

const serialize = (definitions: VariableDefinitions) =>
  serializeVariablesTypes({
    definitions,
    schemaLookup: new Map(),
    variablesFile: '/project/.pikku/variables/pikku-variables.gen.ts',
    packageMappings: {},
  })

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
      /import .* from '\.\/pikku-variables-meta\.gen\.json' with \{ type: 'json' \}/
    )
  })

  test('exports the declared metadata for a host to read', () => {
    const output = serialize([
      { name: 'apiUrl', displayName: 'API URL', variableId: 'API_URL' },
    ])

    assert.match(output, /export const VARIABLES_META/)
  })

  test('imports the sidecar even when nothing is declared', () => {
    const output = serialize([])

    assert.match(output, /pikku-variables-meta\.gen\.json/)
  })
})
