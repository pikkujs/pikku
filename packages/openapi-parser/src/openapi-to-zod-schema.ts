/**
 * Converts OpenAPI schemas into Zod code strings.
 *
 * Chaining order: base → refinements → .nullable() → .optional() → .default() → .describe()
 */

export interface OpenAPISchema {
  type?: string
  format?: string
  description?: string
  enum?: unknown[]
  items?: OpenAPISchema
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  nullable?: boolean
  default?: unknown
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number | boolean
  exclusiveMaximum?: number | boolean
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  oneOf?: OpenAPISchema[]
  anyOf?: OpenAPISchema[]
  allOf?: OpenAPISchema[]
  additionalProperties?: boolean | OpenAPISchema
  $ref?: string
  // Zod-relevant extensions
  readOnly?: boolean
  writeOnly?: boolean
}

export interface ZodCodegenContext {
  /** Map from component schema name to its Zod variable name */
  schemaRefs: Map<string, string>
  /** Track which refs are actually used */
  usedRefs: Set<string>
  /** Indent level for readability */
  indent: number
}

export function createContext(
  schemaRefs?: Map<string, string>
): ZodCodegenContext {
  return {
    schemaRefs: schemaRefs ?? new Map(),
    usedRefs: new Set(),
    indent: 0,
  }
}

/**
 * Convert a single OpenAPI schema to a Zod expression string.
 * Does NOT include .optional() — that's handled at the property level based on `required`.
 */
export function schemaToZod(
  schema: OpenAPISchema,
  ctx: ZodCodegenContext,
  opts: { optional?: boolean } = {}
): string {
  let code = schemaToZodBase(schema, ctx)

  // Refinements
  code = applyRefinements(code, schema)

  // Nullable
  if (schema.nullable) {
    code += '.nullable()'
  }

  // Optional
  if (opts.optional) {
    code += '.optional()'
  }

  // Default — validate type compatibility and coerce mismatches
  if (schema.default !== undefined) {
    let defaultValue = schema.default
    if (defaultValue === null && !schema.nullable) {
      // skip null defaults unless nullable
    } else if (schema.type === 'array' && !Array.isArray(defaultValue)) {
      // skip type-mismatched defaults
    } else if (schema.type === 'boolean' && typeof defaultValue === 'string') {
      defaultValue = defaultValue === 'true'
      code += `.default(${JSON.stringify(defaultValue)})`
    } else if (
      (schema.type === 'number' || schema.type === 'integer') &&
      typeof defaultValue === 'string'
    ) {
      const parsed = Number(defaultValue)
      if (!isNaN(parsed)) code += `.default(${JSON.stringify(parsed)})`
    } else if (schema.type === 'string' && typeof defaultValue === 'number') {
      code += `.default(${JSON.stringify(String(defaultValue))})`
    } else {
      code += `.default(${JSON.stringify(defaultValue)})`
    }
  }

  // Description — sanitize */ to prevent breaking JSDoc comments downstream
  if (schema.description) {
    const safeDesc = schema.description.replace(/\*\//g, '* /')
    code += `.describe(${JSON.stringify(safeDesc)})`
  }

  return code
}

function schemaToZodBase(
  schema: OpenAPISchema,
  ctx: ZodCodegenContext
): string {
  // Handle $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!
    const zodName = ctx.schemaRefs.get(refName)
    if (zodName) {
      ctx.usedRefs.add(refName)
      return zodName
    }
    // Unknown ref — fallback to z.unknown()
    return 'z.unknown()'
  }

  // Handle allOf — merge into single object
  if (schema.allOf && schema.allOf.length > 0) {
    return handleAllOf(schema.allOf, ctx)
  }

  // Handle oneOf/anyOf — union
  if (schema.oneOf && schema.oneOf.length > 0) {
    return handleUnion(schema.oneOf, ctx)
  }
  if (schema.anyOf && schema.anyOf.length > 0) {
    return handleUnion(schema.anyOf, ctx)
  }

  // Handle enum
  if (schema.enum && schema.enum.length > 0) {
    return handleEnum(schema.enum)
  }

  // Handle by type
  switch (schema.type) {
    case 'string':
      return handleString(schema)
    case 'integer':
      return 'z.number().int()'
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    case 'array':
      return handleArray(schema, ctx)
    case 'object':
      return handleObject(schema, ctx)
    default:
      // No type specified but has properties — treat as object
      if (schema.properties) {
        return handleObject(schema, ctx)
      }
      return 'z.unknown()'
  }
}

function handleString(schema: OpenAPISchema): string {
  switch (schema.format) {
    case 'uuid':
      return 'z.string().uuid()'
    case 'date-time':
      return 'z.string().datetime()'
    case 'date':
      return 'z.string().date()'
    case 'email':
      return 'z.string().email()'
    case 'uri':
    case 'url':
      return 'z.string().url()'
    default:
      return 'z.string()'
  }
}

function handleEnum(values: unknown[]): string {
  const primitives = values.filter(
    (v) =>
      v === null ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean'
  )
  if (primitives.length === 0) return 'z.unknown()'
  if (primitives.length === 1) {
    return `z.literal(${JSON.stringify(primitives[0])})`
  }
  if (primitives.every((v) => typeof v === 'string')) {
    const enumValues = primitives.map((v) => JSON.stringify(v)).join(', ')
    return `z.enum([${enumValues}])`
  }
  const literals = primitives
    .map((v) => `z.literal(${JSON.stringify(v)})`)
    .join(', ')
  return `z.union([${literals}])`
}

function handleArray(schema: OpenAPISchema, ctx: ZodCodegenContext): string {
  const itemsZod = schema.items
    ? schemaToZodBase(schema.items, ctx)
    : 'z.unknown()'
  return `z.array(${itemsZod})`
}

function indent(ctx: ZodCodegenContext): string {
  return '  '.repeat(ctx.indent)
}

function handleObject(schema: OpenAPISchema, ctx: ZodCodegenContext): string {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    // Object with no defined properties
    if (schema.additionalProperties) {
      const valueSchema =
        typeof schema.additionalProperties === 'object'
          ? schemaToZod(schema.additionalProperties, ctx)
          : 'z.unknown()'
      return `z.record(z.string(), ${valueSchema})`
    }
    return 'z.record(z.string(), z.unknown())'
  }

  const inner: ZodCodegenContext = { ...ctx, indent: ctx.indent + 1 }
  const pad = indent(inner)
  const closePad = indent(ctx)
  const requiredSet = new Set(schema.required ?? [])
  const entries: string[] = []

  for (const [key, propSchema] of Object.entries(schema.properties)) {
    const isOptional = !requiredSet.has(key)
    const propZod = schemaToZod(propSchema, inner, { optional: isOptional })
    entries.push(`${pad}${safeKey(key)}: ${propZod},`)
  }

  return `z.object({\n${entries.join('\n')}\n${closePad}})`
}

function handleAllOf(schemas: OpenAPISchema[], ctx: ZodCodegenContext): string {
  // Collect all properties from all schemas
  const mergedProps: Record<string, OpenAPISchema> = {}
  const mergedRequired: string[] = []

  for (const sub of schemas) {
    if (sub.$ref) {
      const refName = sub.$ref.split('/').pop()!
      const zodName = ctx.schemaRefs.get(refName)
      if (zodName) {
        ctx.usedRefs.add(refName)
        // If it's a pure ref in an allOf, we'd need to merge/extend
        // For simplicity, if we have refs mixed with objects, use .merge()
      }
    }
    if (sub.properties) {
      Object.assign(mergedProps, sub.properties)
    }
    if (sub.required) {
      mergedRequired.push(...sub.required)
    }
  }

  // If we have only refs, use .merge()
  const refSchemas = schemas.filter((s) => s.$ref)
  const objSchemas = schemas.filter(
    (s) => !s.$ref && (s.properties || s.type === 'object')
  )

  if (refSchemas.length > 0 && objSchemas.length === 0) {
    const parts = refSchemas.map((s) => {
      const refName = s.$ref!.split('/').pop()!
      ctx.usedRefs.add(refName)
      return ctx.schemaRefs.get(refName) || 'z.object({})'
    })
    if (parts.length === 1) return parts[0]
    return parts.reduce((acc, part) => `${acc}.merge(${part})`)
  }

  // Otherwise, merge into a single object
  if (Object.keys(mergedProps).length > 0) {
    return handleObject(
      {
        type: 'object',
        properties: mergedProps,
        required: [...new Set(mergedRequired)],
      },
      ctx
    )
  }

  // Fallback
  return 'z.unknown()'
}

function handleUnion(schemas: OpenAPISchema[], ctx: ZodCodegenContext): string {
  const members = schemas.map((s) => schemaToZodBase(s, ctx))
  if (members.length === 1) return members[0]
  return `z.union([${members.join(', ')}])`
}

function applyRefinements(code: string, schema: OpenAPISchema): string {
  let result = code

  // String refinements
  if (
    (schema.type === 'string' || (!schema.type && !schema.format)) &&
    !schema.enum
  ) {
    if (schema.minLength !== undefined) {
      result += `.min(${schema.minLength})`
    }
    if (schema.maxLength !== undefined) {
      result += `.max(${schema.maxLength})`
    }
    if (schema.pattern) {
      result += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`
    }
  }

  // Number refinements
  if ((schema.type === 'number' || schema.type === 'integer') && !schema.enum) {
    const exMinIsBoolean = typeof schema.exclusiveMinimum === 'boolean'
    const exMaxIsBoolean = typeof schema.exclusiveMaximum === 'boolean'
    if (schema.minimum !== undefined) {
      if (exMinIsBoolean && schema.exclusiveMinimum) {
        result += `.gt(${schema.minimum})`
      } else {
        result += `.min(${schema.minimum})`
      }
    }
    if (schema.maximum !== undefined) {
      if (exMaxIsBoolean && schema.exclusiveMaximum) {
        result += `.lt(${schema.maximum})`
      } else {
        result += `.max(${schema.maximum})`
      }
    }
    if (!exMinIsBoolean && schema.exclusiveMinimum !== undefined) {
      result += `.gt(${schema.exclusiveMinimum})`
    }
    if (!exMaxIsBoolean && schema.exclusiveMaximum !== undefined) {
      result += `.lt(${schema.exclusiveMaximum})`
    }
  }

  // Array refinements
  if (schema.type === 'array') {
    if (schema.minItems !== undefined) {
      result += `.min(${schema.minItems})`
    }
    if (schema.maxItems !== undefined) {
      result += `.max(${schema.maxItems})`
    }
  }

  return result
}

/** Ensure property keys are safe identifiers, or quote them */
function safeKey(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) {
    return key
  }
  return JSON.stringify(key)
}

/**
 * Generate the Zod variable name for a component schema.
 * e.g. "PaginatedResponse" → "PaginatedResponseSchema"
 */
const RESERVED_TYPE_NAMES = new Set([
  'object',
  'string',
  'number',
  'boolean',
  'symbol',
  'undefined',
  'null',
  'void',
  'never',
  'any',
  'unknown',
  'bigint',
  'function',
  'class',
  'enum',
  'interface',
  'type',
  'import',
  'export',
])

export function sanitizeTypeName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9_$]/g, '')
  if (RESERVED_TYPE_NAMES.has(cleaned.toLowerCase())) {
    return `${cleaned}Type`
  }
  return cleaned
}

export function schemaVarName(name: string): string {
  const sanitized = sanitizeTypeName(name)
  return sanitized.endsWith('Schema') ? sanitized : `${sanitized}Schema`
}
