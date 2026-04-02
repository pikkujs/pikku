import { strict as assert } from 'assert'
import { describe, test } from 'node:test'
import {
  schemaToZod,
  createContext,
  schemaVarName,
  sanitizeTypeName,
  type OpenAPISchema,
  type ZodCodegenContext,
} from './openapi-to-zod-schema.js'

function ctx(
  schemaRefs?: Map<string, string>,
  schemaIdentityMap?: Map<object, string>
): ZodCodegenContext {
  return createContext(schemaRefs, schemaIdentityMap)
}

// ---------------------------------------------------------------------------
// Description sanitization (bug: */ in descriptions breaks JSDoc)
// ---------------------------------------------------------------------------
describe('description sanitization', () => {
  test('sanitizes */ in descriptions to prevent JSDoc breakage', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      description: 'Closes comment with */ and then continues',
    }
    const code = schemaToZod(schema, ctx())
    // The description is JSON.stringify'd inside .describe(), so we check the
    // actual string content by extracting the describe argument
    assert.ok(!code.includes('*/'), `should not contain raw */ in: ${code}`)
    assert.ok(code.includes('* /'), 'should replace */ with * /')
  })

  test('handles description with multiple */ occurrences', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      description: 'First */ and second */',
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(!code.includes('*/'), `should not contain raw */ in: ${code}`)
  })
})

// ---------------------------------------------------------------------------
// Enum with mixed types
// ---------------------------------------------------------------------------
describe('enum handling', () => {
  test('filters non-primitive values from enum', () => {
    const schema: OpenAPISchema = {
      enum: ['active', 'inactive', { complex: true }, [1, 2]],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.enum'))
    assert.ok(code.includes('"active"'))
    assert.ok(code.includes('"inactive"'))
    assert.ok(!code.includes('complex'))
  })

  test('handles enum with only non-primitive values', () => {
    const schema: OpenAPISchema = {
      enum: [{ a: 1 }, [1, 2]],
    }
    const code = schemaToZod(schema, ctx())
    assert.equal(code, 'z.unknown()')
  })

  test('handles enum with single value as z.literal', () => {
    const schema: OpenAPISchema = {
      enum: ['only'],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.literal'))
  })

  test('handles enum with mixed string and number as z.union of literals', () => {
    const schema: OpenAPISchema = {
      enum: ['alpha', 42, true],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.union'))
    assert.ok(code.includes('z.literal("alpha")'))
    assert.ok(code.includes('z.literal(42)'))
    assert.ok(code.includes('z.literal(true)'))
  })

  test('allows null in enum values', () => {
    const schema: OpenAPISchema = {
      enum: ['yes', null],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('null'))
  })
})

// ---------------------------------------------------------------------------
// Swagger 2.x exclusiveMinimum (boolean) vs OpenAPI 3.x (number)
// ---------------------------------------------------------------------------
describe('exclusiveMinimum / exclusiveMaximum handling', () => {
  test('Swagger 2.x: boolean exclusiveMinimum with minimum → .gt()', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      minimum: 0,
      exclusiveMinimum: true as any, // Swagger 2.x style
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.gt(0)'), `expected .gt(0), got: ${code}`)
    assert.ok(!code.includes('.min('), 'should not also have .min()')
  })

  test('Swagger 2.x: boolean exclusiveMaximum with maximum → .lt()', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      maximum: 100,
      exclusiveMaximum: true as any,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.lt(100)'), `expected .lt(100), got: ${code}`)
  })

  test('OpenAPI 3.x: numeric exclusiveMinimum → .gt()', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      exclusiveMinimum: 5,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.gt(5)'), `expected .gt(5), got: ${code}`)
  })

  test('OpenAPI 3.x: numeric exclusiveMaximum → .lt()', () => {
    const schema: OpenAPISchema = {
      type: 'integer',
      exclusiveMaximum: 50,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.lt(50)'), `expected .lt(50), got: ${code}`)
  })

  test('non-exclusive minimum/maximum → .min()/.max()', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      minimum: 1,
      maximum: 10,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.min(1)'))
    assert.ok(code.includes('.max(10)'))
  })
})

// ---------------------------------------------------------------------------
// Reserved type names
// ---------------------------------------------------------------------------
describe('sanitizeTypeName', () => {
  test('appends "Type" to reserved type names', () => {
    assert.equal(sanitizeTypeName('Object'), 'ObjectType')
    assert.equal(sanitizeTypeName('String'), 'StringType')
    assert.equal(sanitizeTypeName('Number'), 'NumberType')
    assert.equal(sanitizeTypeName('Boolean'), 'BooleanType')
    assert.equal(sanitizeTypeName('Function'), 'FunctionType')
    assert.equal(sanitizeTypeName('Class'), 'ClassType')
    assert.equal(sanitizeTypeName('Enum'), 'EnumType')
    assert.equal(sanitizeTypeName('Interface'), 'InterfaceType')
    assert.equal(sanitizeTypeName('Type'), 'TypeType')
    // lowercase versions also get the suffix
    assert.equal(sanitizeTypeName('object'), 'objectType')
    assert.equal(sanitizeTypeName('string'), 'stringType')
  })

  test('does not suffix names not in reserved set (e.g. Array)', () => {
    // "array" is not in RESERVED_TYPE_NAMES
    assert.equal(sanitizeTypeName('Array'), 'Array')
  })

  test('strips special chars from type names', () => {
    assert.equal(sanitizeTypeName('Foo.Bar'), 'FooBar')
    assert.equal(sanitizeTypeName('my-type'), 'mytype')
  })

  test('prefixes digit-leading type names with "n"', () => {
    assert.equal(sanitizeTypeName('2DPoint'), 'n2DPoint')
  })

  test('strips numeric separators', () => {
    assert.equal(sanitizeTypeName('Limit1_000'), 'Limit1000')
  })
})

// ---------------------------------------------------------------------------
// schemaVarName
// ---------------------------------------------------------------------------
describe('schemaVarName', () => {
  test('appends "Schema" suffix', () => {
    assert.equal(schemaVarName('User'), 'UserSchema')
  })

  test('does not double-suffix "Schema"', () => {
    assert.equal(schemaVarName('UserSchema'), 'UserSchema')
  })

  test('sanitizes reserved names before adding suffix', () => {
    assert.equal(schemaVarName('Object'), 'ObjectTypeSchema')
  })
})

// ---------------------------------------------------------------------------
// null default on non-nullable schema
// ---------------------------------------------------------------------------
describe('default value handling', () => {
  test('skips null default on non-nullable schema', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      default: null,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      !code.includes('.default('),
      `should skip null default, got: ${code}`
    )
  })

  test('allows null default on nullable schema', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      nullable: true,
      default: null,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default(null)'),
      `expected .default(null), got: ${code}`
    )
  })

  test('coerces boolean default on string schema → string', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      default: false,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default("false")'),
      `expected .default("false"), got: ${code}`
    )
  })

  test('coerces number default on string schema → string', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      default: 42,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default("42")'),
      `expected .default("42"), got: ${code}`
    )
  })

  test('coerces string default on boolean schema', () => {
    const schema: OpenAPISchema = {
      type: 'boolean',
      default: 'true',
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default(true)'),
      `expected .default(true), got: ${code}`
    )
  })

  test('coerces string default on number schema', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      default: '3.14',
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default(3.14)'),
      `expected .default(3.14), got: ${code}`
    )
  })

  test('coerces boolean default on number schema', () => {
    const schema: OpenAPISchema = {
      type: 'number',
      default: true,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      code.includes('.default(1)'),
      `expected .default(1), got: ${code}`
    )
  })

  test('skips non-array default on array schema', () => {
    const schema: OpenAPISchema = {
      type: 'array',
      items: { type: 'string' },
      default: 'not-an-array',
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(
      !code.includes('.default('),
      `should skip mismatched default, got: ${code}`
    )
  })
})

// ---------------------------------------------------------------------------
// Skip refinements on z.any(), z.unknown(), z.union(), z.lazy()
// ---------------------------------------------------------------------------
describe('refinement skipping', () => {
  test('does not apply .min()/.max() to z.any() (no type, no properties)', () => {
    // A schema with no type and no properties but with minimum → z.number()
    // But a truly empty schema → z.unknown()
    const schema: OpenAPISchema = {
      minLength: 5,
      maxLength: 100,
    }
    const code = schemaToZod(schema, ctx())
    // No type, no properties, no min/max numbers → z.unknown()
    assert.ok(
      !code.includes('.min('),
      `should not have .min() on z.unknown(), got: ${code}`
    )
  })

  test('does not apply refinements to z.union()', () => {
    const schema: OpenAPISchema = {
      oneOf: [{ type: 'string' }, { type: 'number' }],
      minLength: 1,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.startsWith('z.union('))
    assert.ok(
      !code.includes('.min('),
      `should not have .min() on union, got: ${code}`
    )
  })

  test('does not apply refinements to schema variable references', () => {
    const refs = new Map([['User', 'UserSchema']])
    const schema: OpenAPISchema = {
      $ref: '#/components/schemas/User',
      minLength: 1, // should be ignored
    }
    const c = ctx(refs)
    const code = schemaToZod(schema, c)
    assert.equal(code, 'UserSchema')
  })
})

// ---------------------------------------------------------------------------
// Infer z.number() when minimum/maximum present but no type
// ---------------------------------------------------------------------------
describe('type inference from constraints', () => {
  test('infers z.number() when minimum is present without type', () => {
    const schema: OpenAPISchema = {
      minimum: 0,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.number()'), `expected z.number(), got: ${code}`)
    assert.ok(code.includes('.min(0)'))
  })

  test('infers z.number() when maximum is present without type', () => {
    const schema: OpenAPISchema = {
      maximum: 100,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.number()'))
    assert.ok(code.includes('.max(100)'))
  })

  test('infers z.number() from exclusiveMinimum without type', () => {
    const schema: OpenAPISchema = {
      exclusiveMinimum: 0,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.number()'))
    assert.ok(code.includes('.gt(0)'))
  })
})

// ---------------------------------------------------------------------------
// Depth limit — deeply nested schemas → z.any()
// ---------------------------------------------------------------------------
describe('depth limit', () => {
  test('returns z.any() for schemas nested deeper than 10 levels', () => {
    // Build a deeply nested object schema (12 levels)
    let inner: OpenAPISchema = { type: 'string' }
    for (let i = 0; i < 12; i++) {
      inner = {
        type: 'object',
        properties: { nested: inner },
      }
    }
    const code = schemaToZod(inner, ctx())
    // The innermost levels should collapse to z.any()
    assert.ok(
      code.includes('z.any()'),
      `expected z.any() in deeply nested, got: ${code}`
    )
  })
})

// ---------------------------------------------------------------------------
// Cycle detection in allOf/object recursion → z.any()
// ---------------------------------------------------------------------------
describe('cycle detection', () => {
  test('returns z.any() for cyclically self-referencing schema', () => {
    const schema: any = {
      type: 'object',
      properties: {},
    }
    // Create a cycle: schema.properties.self = schema
    schema.properties.self = schema
    const code = schemaToZod(schema, ctx())
    // Should not stack overflow, and inner self should be z.any()
    assert.ok(
      code.includes('z.any()'),
      `expected z.any() for cycle, got: ${code}`
    )
  })

  test('handles cycle in allOf without stack overflow', () => {
    const schemaA: any = {
      type: 'object',
      properties: { name: { type: 'string' } },
    }
    const schemaB: any = {
      allOf: [schemaA],
    }
    // Create cycle: A references B
    schemaA.properties.related = schemaB
    // B references A via allOf

    // This should not throw
    const code = schemaToZod(schemaB, ctx())
    assert.ok(typeof code === 'string')
    assert.ok(
      code.includes('z.any()'),
      `expected z.any() breaking cycle, got: ${code}`
    )
  })
})

// ---------------------------------------------------------------------------
// Object with no type but has properties → treat as object
// ---------------------------------------------------------------------------
describe('implicit object type', () => {
  test('treats schema with properties but no type as object', () => {
    const schema: OpenAPISchema = {
      properties: {
        name: { type: 'string' },
        age: { type: 'integer' },
      },
      required: ['name'],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.object('))
    assert.ok(code.includes('z.string()'))
    assert.ok(code.includes('z.number().int()'))
  })
})

// ---------------------------------------------------------------------------
// String format handling
// ---------------------------------------------------------------------------
describe('string format handling', () => {
  test('uuid format → z.string().uuid()', () => {
    const code = schemaToZod({ type: 'string', format: 'uuid' }, ctx())
    assert.ok(code.includes('.uuid()'))
  })

  test('date-time format → z.string().datetime()', () => {
    const code = schemaToZod({ type: 'string', format: 'date-time' }, ctx())
    assert.ok(code.includes('.datetime()'))
  })

  test('email format → z.string().email()', () => {
    const code = schemaToZod({ type: 'string', format: 'email' }, ctx())
    assert.ok(code.includes('.email()'))
  })

  test('uri format → z.string().url()', () => {
    const code = schemaToZod({ type: 'string', format: 'uri' }, ctx())
    assert.ok(code.includes('.url()'))
  })
})

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------
describe('$ref handling', () => {
  test('replaces $ref with schema variable name', () => {
    const refs = new Map([['Pet', 'PetSchema']])
    const schema: OpenAPISchema = {
      $ref: '#/components/schemas/Pet',
    }
    const c = ctx(refs)
    const code = schemaToZod(schema, c)
    assert.equal(code, 'PetSchema')
    assert.ok(c.usedRefs.has('Pet'))
  })

  test('falls back to z.unknown() for unresolvable $ref', () => {
    const schema: OpenAPISchema = {
      $ref: '#/components/schemas/Unknown',
    }
    const code = schemaToZod(schema, ctx())
    assert.equal(code, 'z.unknown()')
  })

  test('detects resolved $ref by object identity', () => {
    const userSchema: OpenAPISchema = {
      type: 'object',
      properties: { id: { type: 'string' } },
    }
    const refs = new Map([['User', 'UserSchema']])
    const identityMap = new Map<object, string>([[userSchema, 'User']])
    const c = ctx(refs, identityMap)

    // A schema that IS the same object as the component schema
    const code = schemaToZod(userSchema, c)
    assert.equal(code, 'UserSchema')
  })
})

// ---------------------------------------------------------------------------
// Nullable and optional chaining order
// ---------------------------------------------------------------------------
describe('nullable and optional', () => {
  test('chains .nullable().optional() in correct order', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      nullable: true,
    }
    const code = schemaToZod(schema, ctx(), { optional: true })
    const nullableIdx = code.indexOf('.nullable()')
    const optionalIdx = code.indexOf('.optional()')
    assert.ok(
      nullableIdx < optionalIdx,
      `nullable should come before optional: ${code}`
    )
  })
})

// ---------------------------------------------------------------------------
// Array and record schemas
// ---------------------------------------------------------------------------
describe('array and record', () => {
  test('array with items → z.array(inner)', () => {
    const schema: OpenAPISchema = {
      type: 'array',
      items: { type: 'string' },
    }
    const code = schemaToZod(schema, ctx())
    assert.equal(code, 'z.array(z.string())')
  })

  test('array without items → z.array(z.unknown())', () => {
    const schema: OpenAPISchema = {
      type: 'array',
    }
    const code = schemaToZod(schema, ctx())
    assert.equal(code, 'z.array(z.unknown())')
  })

  test('object with no properties but additionalProperties → z.record()', () => {
    const schema: OpenAPISchema = {
      type: 'object',
      additionalProperties: { type: 'number' },
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.record(z.string(), z.number())'))
  })
})

// ---------------------------------------------------------------------------
// allOf merging
// ---------------------------------------------------------------------------
describe('allOf handling', () => {
  test('merges properties from multiple allOf schemas', () => {
    const schema: OpenAPISchema = {
      allOf: [
        {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        {
          type: 'object',
          properties: { age: { type: 'integer' } },
        },
      ],
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('z.object('))
    assert.ok(code.includes('name:'))
    assert.ok(code.includes('age:'))
  })

  test('uses .merge() for allOf with only $refs', () => {
    const refs = new Map([
      ['Base', 'BaseSchema'],
      ['Extra', 'ExtraSchema'],
    ])
    const schema: OpenAPISchema = {
      allOf: [
        { $ref: '#/components/schemas/Base' },
        { $ref: '#/components/schemas/Extra' },
      ],
    }
    const code = schemaToZod(schema, ctx(refs))
    assert.ok(
      code.includes('BaseSchema.merge(ExtraSchema)'),
      `expected merge, got: ${code}`
    )
  })
})

// ---------------------------------------------------------------------------
// Array refinements (minItems / maxItems)
// ---------------------------------------------------------------------------
describe('array refinements', () => {
  test('applies .min() and .max() for minItems/maxItems', () => {
    const schema: OpenAPISchema = {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 50,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.min(1)'))
    assert.ok(code.includes('.max(50)'))
  })
})

// ---------------------------------------------------------------------------
// String refinements (minLength / maxLength / pattern)
// ---------------------------------------------------------------------------
describe('string refinements', () => {
  test('applies .min() and .max() for minLength/maxLength', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      minLength: 3,
      maxLength: 255,
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.min(3)'))
    assert.ok(code.includes('.max(255)'))
  })

  test('applies .regex() for pattern', () => {
    const schema: OpenAPISchema = {
      type: 'string',
      pattern: '^[a-z]+$',
    }
    const code = schemaToZod(schema, ctx())
    assert.ok(code.includes('.regex('))
    assert.ok(code.includes('^[a-z]+$'))
  })
})
