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

  test('AgentCall declares every optional AIAgentInput field', () => {
    const { schemas } = generate()
    for (const field of optionalInputs) {
      assert.ok(
        new RegExp(`${field}: [^\\n]*\\.optional\\(\\)`).test(schemas),
        `expected AgentCall to declare an optional \`${field}\``
      )
    }
  })

  for (const caller of ['agentCaller', 'agentStreamCaller']) {
    test(`${caller} takes its input from the shared AgentCall schema`, () => {
      const { functions } = generate()
      const body = callerBody(functions, caller)
      assert.ok(
        body.includes('input: AgentCall'),
        `expected ${caller} to reference the shared schema`
      )
      assert.ok(
        !body.includes('pikkuSessionlessFunc<'),
        'schemas and generics are mutually exclusive'
      )
    })

    test(`${caller} forwards every optional AIAgentInput field to the rpc call`, () => {
      const { functions } = generate()
      const body = callerBody(functions, caller)
      for (const field of optionalInputs) {
        assert.ok(
          new RegExp(`\\.\\.\\.\\(data\\.${field}[^)]*\\)`).test(body),
          `expected ${caller} to conditionally spread \`${field}\` into the rpc call`
        )
      }
    })
  }

  test('attachments are typed rather than accepted as opaque data', () => {
    const { schemas } = generate()
    assert.ok(
      schemas.includes("z.enum(['image', 'file'])"),
      'expected the attachment kind to be a literal union'
    )
    for (const field of ['data', 'url', 'mediaType', 'filename']) {
      assert.ok(
        new RegExp(`${field}: z\\.string\\(\\)\\.optional\\(\\)`).test(schemas),
        `expected attachments to declare an optional \`${field}\``
      )
    }
  })

  test('the schemas module imports nothing but zod', () => {
    const { schemas, functions } = generate()
    assert.ok(schemas.includes("import { z } from 'zod'"))
    assert.ok(
      !schemas.includes('pikku-types.gen.js'),
      'the inspector imports this module directly, so it must not reach for a path deploy codegen rewrites'
    )
    assert.ok(!schemas.includes('@pikku/core'))
    assert.ok(functions.includes("from './agent.schemas.gen.js'"))
  })
})
