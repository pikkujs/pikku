// The QuickJS half of zodjs.Converter: the conversion scripts/vendor-schemas.mjs
// does under Node, run over modules esbuild bundled into the same script.
//
// Every import outside the project (a database client, an SDK, node:fs) is
// replaced by a stub, because QuickJS has neither Node's built-ins nor any
// reason to start a connection pool. A schema built from a stub would convert
// to something plausible and wrong, so each schema's definition is walked for
// one before it is converted, and a stub turned into a string or number
// throws while its module loads. Either way the schema is handed back to be
// converted under Node, never converted here.

const stubs = new WeakMap()
const STUB_KEY = '__pikkuStub'

export const createStub = (from) => {
  'use strict'
  const target = function () {}
  const coerce = () => {
    throw new Error(
      `a value imported from '${from}' was used as a string or number while the module loaded`
    )
  }
  let stub
  const read = (key) => {
    if (key === Symbol.toPrimitive) return coerce
    // Neither a promise nor an ES module namespace: `await stub` and
    // esbuild's interop must not treat it as one.
    if (key === 'then' || key === '__esModule') return undefined
    return stub
  }
  // esbuild's interop copies a CommonJS module's own properties onto a new
  // object whose prototype is the module's, so a named import is read
  // through the prototype.
  const prototype = new Proxy({}, { get: (_, key) => read(key) })
  stub = new Proxy(target, {
    get: (_, key) => read(key),
    apply: () => stub,
    construct: () => stub,
    getPrototypeOf: () => prototype,
    // One enumerable key, so Object.values(stub) is [stub], not an empty
    // list that z.enum() would accept without complaint.
    ownKeys: () => [...Reflect.ownKeys(target), STUB_KEY],
    getOwnPropertyDescriptor: (_, key) =>
      key === STUB_KEY
        ? { value: stub, enumerable: true, configurable: true, writable: true }
        : Reflect.getOwnPropertyDescriptor(target, key),
  })
  stubs.set(stub, from)
  stubs.set(prototype, from)
  return stub
}

// The package a stub reachable from value stands in for, or undefined.
// Metadata (.describe(), .meta()) lives in the registry, not on the schema.
const findStub = (value, registry) => {
  const seen = new Set()
  const pending = [value]
  while (pending.length > 0) {
    const next = pending.pop()
    if (next === null || (typeof next !== 'object' && typeof next !== 'function')) continue
    const from = stubs.get(next)
    if (from !== undefined) return from
    if (typeof next === 'function' || seen.has(next)) continue
    seen.add(next)
    try {
      const metadata = registry.get(next)
      if (metadata !== undefined) pending.push(metadata)
    } catch {
      // Not a schema.
    }
    if (next instanceof Map) {
      for (const [k, v] of next) pending.push(k, v)
      continue
    }
    if (next instanceof Set) {
      for (const v of next) pending.push(v)
      continue
    }
    // Not Object.keys: Zod keeps a schema's definition, and every check's,
    // under a non-enumerable _zod.
    for (const key of Object.getOwnPropertyNames(next)) {
      try {
        pending.push(next[key])
      } catch {
        // A getter that throws holds nothing to find.
      }
    }
  }
  return undefined
}

const SCHEMA_TRANSFORM_NOT_SUPPORTED = 'PKU491'

const message = (e) => (e instanceof Error ? e.message : String(e))

export const run = ({ z, zodToTypeText, findZodTransform, files, lookup }) => {
  // processZodSchema from vendor-schemas.mjs, unchanged.
  function processZodSchema(schemaName, zodSchema, schemas) {
    const transformPath = findZodTransform(zodSchema)
    if (transformPath !== undefined) {
      const where = transformPath === '' ? 'the schema itself' : transformPath
      throw new Error(
        `[${SCHEMA_TRANSFORM_NOT_SUPPORTED}] '${schemaName}' contains a .transform() at ${where}.\n` +
          'A transform makes the value sent and the value received two different ' +
          'shapes, and a wire contract describes one: it cannot be expressed in ' +
          'JSON Schema or in the generated TypeScript.\n' +
          'Validate with the plain schema and apply the transform inside the ' +
          'function, or move it to the output type.'
      )
    }
    const schema = z.toJSONSchema(zodSchema, {
      unrepresentable: 'any',
      override: ({ zodSchema, jsonSchema }) => {
        if (zodSchema._zod?.def?.type === 'date') {
          jsonSchema.type = 'string'
          jsonSchema.format = 'date-time'
        }
      },
    })
    if (schema.required && schema.properties) {
      schema.required = schema.required.filter((fieldName) => {
        const prop = schema.properties[fieldName]
        return prop && prop.default === undefined
      })
      if (schema.required.length === 0) delete schema.required
    }
    schemas.push([schemaName, { schema, typeText: zodToTypeText(zodSchema) }])
  }

  const schemas = []
  const errors = []
  const fallback = []

  if (typeof z.toJSONSchema !== 'function') {
    const reason = "the project's zod has no toJSONSchema (Zod 4 is needed)"
    return { schemas, errors, fallback: lookup.map(([name]) => [name, reason]) }
  }

  const modules = files.map(({ file, load }) => {
    try {
      return { module: load() }
    } catch (e) {
      return { failed: `${file} could not be loaded: ${message(e)}` }
    }
  })

  for (const [schemaName, ref, index] of lookup) {
    const { module, failed } = modules[index]
    if (failed) {
      fallback.push([schemaName, failed])
      continue
    }
    const zodSchema = module[ref.variableName]
    if (!zodSchema) {
      errors.push(
        `Could not find exported schema '${ref.variableName}' in ${files[index].file} for ${schemaName}. Available exports: ${Object.keys(module).join(', ')}`
      )
      continue
    }
    const from = findStub(zodSchema, z.globalRegistry)
    if (from !== undefined) {
      fallback.push([schemaName, `it is built from '${from}', which only loads under Node`])
      continue
    }
    try {
      processZodSchema(schemaName, zodSchema, schemas)
    } catch (e) {
      errors.push(`Could not convert Zod schema '${schemaName}': ${message(e)}`)
    }
  }

  return { schemas, errors, fallback }
}
