import { test } from 'node:test'
import assert from 'node:assert/strict'
import { outputParserToZod } from './output-schema.js'
import type { ParsedNode } from './types.js'

const parserNode = (parameters: Record<string, unknown>): ParsedNode => ({
  id: 'op',
  name: 'Structured Output Parser',
  nodeId: 'parser',
  type: '@n8n/n8n-nodes-langchain.outputParserStructured',
  typeShort: 'outputParserStructured',
  parameters,
  disabled: false,
  role: 'outputParser',
  rpcName: 'noop',
})

test('manual inputSchema: draft-07 nullable union → .nullable(), required honored', () => {
  const zod = outputParserToZod(
    parserNode({
      schemaType: 'manual',
      inputSchema: JSON.stringify({
        type: 'object',
        properties: {
          domain: { type: ['string', 'null'] },
          score: { type: ['number', 'null'] },
          ok: { type: 'boolean' },
        },
        required: ['ok'],
      }),
    })
  )
  assert.ok(zod)
  assert.match(zod!, /domain: z\.string\(\)\.nullable\(\)\.optional\(\)/)
  assert.match(zod!, /score: z\.number\(\)\.nullable\(\)\.optional\(\)/)
  assert.match(zod!, /ok: z\.boolean\(\)/)
})

test('jsonSchema (draft-07) with nested array of objects', () => {
  const zod = outputParserToZod(
    parserNode({
      jsonSchema: JSON.stringify({
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: { question: { type: 'string' } },
              required: ['question'],
            },
          },
        },
      }),
    })
  )
  assert.ok(zod)
  assert.match(zod!, /questions: z\.array\(z\.object\(/)
  assert.match(zod!, /question: z\.string\(\)/)
})

test('jsonSchemaExample (root array) → inferred array-of-object schema', () => {
  const zod = outputParserToZod(
    parserNode({
      jsonSchemaExample: JSON.stringify([{ Prompt: 'a golden-hour shot' }]),
    })
  )
  assert.ok(zod)
  assert.match(zod!, /z\.array\(z\.object\(/)
  assert.match(zod!, /Prompt: z\.string\(\)/)
})

test('no usable schema → undefined', () => {
  assert.equal(outputParserToZod(parserNode({})), undefined)
  assert.equal(
    outputParserToZod(parserNode({ inputSchema: 'not json {' })),
    undefined
  )
})
