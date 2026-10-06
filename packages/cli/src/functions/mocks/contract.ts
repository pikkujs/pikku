export type Kind =
  'string' | 'number' | 'boolean' | 'null' | 'array' | 'object' | 'any'

export interface Field {
  kinds: Kind[]
  optional: boolean
  open?: boolean
}

/** Flat map of path → field. `$` is the response, `.x` a field, `[]` an array element. */
export type Contract = Record<string, Field>

export interface ContractChange {
  path: string
  kind: 'mock-only' | 'function-only' | 'retyped'
  mock?: Kind[]
  fn?: Kind[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const kindOf = (value: unknown): Kind =>
  value === null
    ? 'null'
    : Array.isArray(value)
      ? 'array'
      : typeof value === 'object'
        ? 'object'
        : typeof value === 'number'
          ? 'number'
          : typeof value === 'boolean'
            ? 'boolean'
            : 'string'

const sortKinds = (kinds: Iterable<Kind>): Kind[] => [...new Set(kinds)].sort()

const observe = (
  values: unknown[],
  path: string,
  optional: boolean,
  out: Contract
): void => {
  if (values.length === 0) return
  out[path] = { kinds: sortKinds(values.map(kindOf)), optional }
  const objects = values.filter(isRecord)
  const keys = new Set(objects.flatMap((object) => Object.keys(object)))
  for (const key of keys) {
    const present = objects.filter((object) => key in object).map((o) => o[key])
    observe(present, `${path}.${key}`, present.length < objects.length, out)
  }
  const elements = values.filter(Array.isArray).flat()
  observe(elements, `${path}[]`, false, out)
}

/** The shape every sample agrees on. A field some samples lack is optional; an empty array adds no element shape. */
export const inferContract = (samples: unknown[]): Contract => {
  const out: Contract = {}
  observe(samples, '$', false, out)
  return out
}

const mergeBranches = (branches: Contract[]): Contract => {
  const out: Contract = {}
  for (const path of new Set(branches.flatMap((b) => Object.keys(b)))) {
    const fields = branches.map((b) => b[path])
    const present = fields.filter((f): f is Field => !!f)
    out[path] = {
      kinds: sortKinds(present.flatMap((f) => f.kinds)),
      optional:
        present.length < branches.length || present.some((f) => f.optional),
      ...(present.some((f) => f.open) ? { open: true } : {}),
    }
  }
  return out
}

const refTarget = (ref: string, root: Record<string, unknown>): unknown => {
  const match = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref)
  const table = match && root[match[1]!]
  return isRecord(table) ? table[match![2]!] : undefined
}

const kindsOfSchema = (schema: Record<string, unknown>): Kind[] => {
  const declared = schema.type
  if (typeof declared === 'string' || Array.isArray(declared)) {
    return sortKinds(
      [declared].flat().map((t) => (t === 'integer' ? 'number' : (t as Kind)))
    )
  }
  const literals = Array.isArray(schema.enum)
    ? schema.enum
    : 'const' in schema
      ? [schema.const]
      : null
  if (literals) return sortKinds(literals.map(kindOf))
  if (isRecord(schema.properties)) return ['object']
  if (schema.items !== undefined) return ['array']
  return ['any']
}

const fromSchema = (
  schema: unknown,
  path: string,
  optional: boolean,
  root: Record<string, unknown>,
  stack: string[]
): Contract => {
  if (!isRecord(schema)) return { [path]: { kinds: ['any'], optional } }
  if (typeof schema.$ref === 'string') {
    const target = refTarget(schema.$ref, root)
    if (target === undefined || stack.includes(schema.$ref)) {
      return { [path]: { kinds: ['any'], optional } }
    }
    return fromSchema(target, path, optional, root, [...stack, schema.$ref])
  }
  const branches = [schema.anyOf, schema.oneOf].find(Array.isArray) as
    unknown[] | undefined
  if (branches) {
    const merged = mergeBranches(
      branches.map((b) => fromSchema(b, path, optional, root, stack))
    )
    merged[path] = { ...merged[path]!, optional }
    return merged
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((b) =>
      fromSchema(b, path, optional, root, stack)
    )
    const out: Contract = {}
    for (const part of parts) {
      for (const [p, field] of Object.entries(part)) {
        const seen = out[p]
        out[p] = seen
          ? {
              kinds: sortKinds([...seen.kinds, ...field.kinds]),
              optional: seen.optional && field.optional,
            }
          : field
      }
    }
    return out
  }
  const kinds = kindsOfSchema(schema)
  const out: Contract = { [path]: { kinds, optional } }
  if (kinds.includes('any')) out[path]!.open = true
  const properties = isRecord(schema.properties) ? schema.properties : null
  if (properties) {
    const required = new Set(
      Array.isArray(schema.required) ? (schema.required as string[]) : []
    )
    for (const [key, child] of Object.entries(properties)) {
      Object.assign(
        out,
        fromSchema(child, `${path}.${key}`, !required.has(key), root, stack)
      )
    }
  } else if (kinds.includes('object')) {
    out[path]!.open = true
  }
  if (schema.items !== undefined) {
    const items = Array.isArray(schema.items)
      ? { anyOf: schema.items }
      : schema.items
    Object.assign(out, fromSchema(items, `${path}[]`, false, root, stack))
  }
  return out
}

/** The same flat shape, read from a function's JSON Schema. */
export const contractFromSchema = (schema: unknown): Contract =>
  fromSchema(schema, '$', false, isRecord(schema) ? schema : {}, [])

const underOpen = (path: string, contract: Contract): boolean =>
  Object.entries(contract).some(
    ([p, field]) =>
      field.open && (path.startsWith(`${p}.`) || path.startsWith(`${p}[]`))
  )

const parentOf = (path: string): string | null => {
  const cut = Math.max(path.lastIndexOf('.'), path.lastIndexOf('[]'))
  return cut > 0 ? path.slice(0, cut) : null
}

const hasAncestor = (path: string, set: Set<string>): boolean => {
  for (let p = parentOf(path); p; p = parentOf(p)) if (set.has(p)) return true
  return false
}

/** Where a mock's observable shape and a function's output schema disagree. */
export const compareContracts = (
  mock: Contract,
  fn: Contract
): ContractChange[] => {
  const changes: ContractChange[] = []
  for (const [path, field] of Object.entries(mock)) {
    const expected = fn[path]
    if (!expected) {
      if (!underOpen(path, fn)) {
        changes.push({ path, kind: 'mock-only', mock: field.kinds })
      }
    } else if (
      !expected.kinds.includes('any') &&
      !field.kinds.every((k) => expected.kinds.includes(k))
    ) {
      changes.push({
        path,
        kind: 'retyped',
        mock: field.kinds,
        fn: expected.kinds,
      })
    }
  }
  const missing = new Set<string>()
  for (const [path, field] of Object.entries(fn)) {
    if (!mock[path] && !field.optional) missing.add(path)
  }
  for (const path of missing) {
    if (hasAncestor(path, missing)) continue
    const parent = parentOf(path)
    if (parent && !mock[parent]) continue
    changes.push({ path, kind: 'function-only', fn: fn[path]!.kinds })
  }
  return changes
}
