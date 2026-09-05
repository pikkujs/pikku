import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import ts from 'typescript'
import { serializePersonasTypes } from './serialize-personas-types.js'

const parseErrors = (source: string) => {
  const file = ts.createSourceFile(
    'pikku-personas.gen.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  return (file as unknown as { parseDiagnostics: ts.Diagnostic[] })
    .parseDiagnostics
}

const serialize = (environmentNames: string[]) =>
  serializePersonasTypes({
    definitions: {},
    rolesImportPath: '../roles/pikku-roles.gen.js',
    environmentNames,
  })

describe('serializePersonasTypes', () => {
  test('emits a union of the configured environments', () => {
    const output = serialize(['local'])

    assert.match(output, /type EnvironmentName =\s*\|\s*["']local["']/)
  })

  test('emits a never union when no environment is configured', () => {
    assert.match(serialize([]), /type EnvironmentName = never/)
  })

  test('sorts environments so output is stable across runs', () => {
    assert.equal(
      serialize(['staging', 'local']),
      serialize(['local', 'staging'])
    )
  })

  test('emits a parseable file for an environment name needing escaping', () => {
    const output = serialize(['local\\legacy'])

    assert.deepEqual(parseErrors(output), [])
    assert.ok(
      output.includes(JSON.stringify('local\\legacy')),
      'expected the backslash to survive rather than escape the next character'
    )
  })

  test('types persona roles against the generated role union', () => {
    const output = serialize(['local'])

    assert.match(output, /roles\?: SystemRoleName\[\]/)
    assert.match(
      output,
      /import type \{ SystemRoleName \} from '\.\.\/roles\/pikku-roles\.gen\.js'/
    )
  })
})
