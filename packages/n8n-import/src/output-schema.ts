import toJsonSchema from 'to-json-schema'
import {
  schemaToZod,
  createContext,
  type OpenAPISchema,
} from '@pikku/openapi-to-zod-schema'
import type { ParsedNode } from './types.js'

/**
 * Read the JSON Schema an `outputParserStructured` node describes. Three shapes
 * occur in the wild:
 *  - `inputSchema` (manual mode) — a draft-07 schema string
 *  - `jsonSchema` — a draft-07 schema string
 *  - `jsonSchemaExample` — an example value; n8n infers a schema from it, so we
 *    do the same via `to-json-schema`.
 */
function readParserSchema(
  parameters: Record<string, unknown>
): Record<string, unknown> | undefined {
  const parse = (raw: unknown): Record<string, unknown> | undefined => {
    if (typeof raw !== 'string' || !raw.trim()) return undefined
    try {
      const obj = JSON.parse(raw)
      return obj && typeof obj === 'object' ? obj : undefined
    } catch {
      return undefined
    }
  }

  const schema = parse(parameters.inputSchema) ?? parse(parameters.jsonSchema)
  if (schema) return schema

  const exampleRaw = parameters.jsonSchemaExample
  if (typeof exampleRaw === 'string' && exampleRaw.trim()) {
    try {
      const example = JSON.parse(exampleRaw)
      return toJsonSchema(example, {
        arrays: { mode: 'first' },
      }) as Record<string, unknown>
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Normalize a draft-07 schema into the OpenAPI-3.0 flavor `schemaToZod` reads.
 * The one real divergence in the corpus is nullable unions expressed as a `type`
 * array (`["string", "null"]`) rather than OpenAPI's `nullable: true`. Recurses
 * through every nested schema position.
 */
function normalizeDraft07(input: Record<string, unknown>): OpenAPISchema {
  const out: Record<string, unknown> = { ...input }

  const type = out.type
  if (Array.isArray(type)) {
    const nonNull = type.filter((t) => t !== 'null')
    const hasNull = type.includes('null')
    if (nonNull.length <= 1) {
      out.type = nonNull[0]
    } else {
      delete out.type
      out.oneOf = nonNull.map((t) => ({ type: t }))
    }
    if (hasNull) out.nullable = true
  }

  if (out.properties && typeof out.properties === 'object') {
    const props: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(
      out.properties as Record<string, unknown>
    )) {
      props[k] = normalizeDraft07(v as Record<string, unknown>)
    }
    out.properties = props
  }
  if (out.items && typeof out.items === 'object') {
    out.items = normalizeDraft07(out.items as Record<string, unknown>)
  }
  if (
    out.additionalProperties &&
    typeof out.additionalProperties === 'object'
  ) {
    out.additionalProperties = normalizeDraft07(
      out.additionalProperties as Record<string, unknown>
    )
  }
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const arr = out[key]
    if (Array.isArray(arr)) {
      out[key] = arr.map((s) => normalizeDraft07(s as Record<string, unknown>))
    }
  }

  return out as OpenAPISchema
}

/**
 * Convert an `outputParserStructured` node into a Zod code string for an agent's
 * `output` field. Returns undefined when the node carries no usable schema.
 */
export function outputParserToZod(node: ParsedNode): string | undefined {
  const schema = readParserSchema(node.parameters)
  if (!schema) return undefined
  const normalized = normalizeDraft07(schema)
  return schemaToZod(normalized, createContext())
}
