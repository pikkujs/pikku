import { describe, test } from 'node:test'
import assert from 'node:assert'
import { serializePublicAgent } from './serialize-public-agent.js'

const generate = () => serializePublicAgent('./pikku-types.gen.js')

/**
 * The generated HTTP surface is the only contract a shipped app has for calling
 * an agent, so anything `AIAgentInput` accepts has to survive the round trip —
 * a field the caller declares but never forwards is silently dropped.
 */
describe('serializePublicAgent — agent HTTP surface', () => {
  const optionalInputs = ['attachments', 'model', 'temperature', 'context']

  const callerBody = (output: string, exportName: string) => {
    const start = output.indexOf(`export const ${exportName} =`)
    assert.notEqual(start, -1, `expected ${exportName} to be generated`)
    const end = output.indexOf('export const ', start + 1)
    return output.slice(start, end === -1 ? undefined : end)
  }

  for (const caller of ['agentCaller', 'agentStreamCaller']) {
    test(`${caller} declares every optional AIAgentInput field`, () => {
      const body = callerBody(generate(), caller)
      for (const field of optionalInputs) {
        assert.ok(
          body.includes(`${field}?:`),
          `expected ${caller} to declare an optional \`${field}\``
        )
      }
    })

    /**
     * The schema extractor only reads type literals in the generic position and
     * synthesises the schema name from the function name. Behind a named alias
     * it records an `inputSchemaName` with no schema behind it, and the runtime
     * then rejects every agent call with MissingSchemaError.
     */
    test(`${caller} declares its input inline so a schema is generated`, () => {
      const body = callerBody(generate(), caller)
      const generic = body.slice(body.indexOf('pikkuSessionlessFunc<'))
      assert.ok(
        generic.startsWith('pikkuSessionlessFunc<{'),
        `expected ${caller} to open its generic with an inline type literal`
      )
    })

    test(`${caller} forwards every optional AIAgentInput field to the rpc call`, () => {
      const body = callerBody(generate(), caller)
      for (const field of optionalInputs) {
        assert.ok(
          new RegExp(`\\.\\.\\.\\(data\\.${field}[^)]*\\)`).test(body),
          `expected ${caller} to conditionally spread \`${field}\` into the rpc call`
        )
      }
    })
  }

  test('attachments are typed rather than accepted as opaque data', () => {
    const output = generate()
    assert.ok(
      output.includes("type: 'image' | 'file'"),
      'expected the attachment kind to be a literal union'
    )
    for (const field of ['data', 'url', 'mediaType', 'filename']) {
      assert.ok(
        output.includes(`${field}?:`),
        `expected attachments to declare an optional \`${field}\``
      )
    }
  })
})
