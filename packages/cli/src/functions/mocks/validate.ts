const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const typeOf = (value: unknown): string =>
  value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value

const matches = (value: unknown, type: string): boolean =>
  type === 'integer'
    ? Number.isInteger(value)
    : type === 'number'
      ? typeof value === 'number'
      : typeOf(value) === type

const target = (ref: string, root: Record<string, unknown>): unknown => {
  const match = /^#\/(definitions|\$defs)\/(.+)$/.exec(ref)
  const table = match && root[match[1]!]
  return isRecord(table) ? table[match![2]!] : undefined
}

const check = (
  value: unknown,
  schema: unknown,
  path: string,
  root: Record<string, unknown>,
  depth: number,
  errors: string[]
): void => {
  if (!isRecord(schema) || depth > 40) return
  if (typeof schema.$ref === 'string') {
    return check(
      value,
      target(schema.$ref, root),
      path,
      root,
      depth + 1,
      errors
    )
  }
  for (const key of ['anyOf', 'oneOf'] as const) {
    const branches = schema[key]
    if (!Array.isArray(branches)) continue
    const failures = branches.map((branch) => {
      const own: string[] = []
      check(value, branch, path, root, depth + 1, own)
      return own
    })
    if (failures.every((own) => own.length > 0)) {
      errors.push(
        failures.length === 1
          ? failures[0]![0]!
          : `${path} matches none of the allowed shapes`
      )
    }
  }
  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf)
      check(value, part, path, root, depth + 1, errors)
  }
  if (schema.type !== undefined) {
    const types = [schema.type].flat() as string[]
    if (!types.some((t) => matches(value, t))) {
      errors.push(`${path} is ${typeOf(value)}, expected ${types.join(' or ')}`)
      return
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((v) => v === value)) {
    errors.push(
      `${path} is not one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`
    )
  }
  if ('const' in schema && schema.const !== value) {
    errors.push(`${path} is not ${JSON.stringify(schema.const)}`)
  }
  if (isRecord(value)) {
    const required = Array.isArray(schema.required)
      ? (schema.required as string[])
      : []
    for (const key of required) {
      if (!(key in value)) errors.push(`${path}.${key} is missing`)
    }
    if (isRecord(schema.properties)) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (key in value)
          check(value[key], child, `${path}.${key}`, root, depth + 1, errors)
      }
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, index) => {
      const own = Array.isArray(schema.items)
        ? schema.items[index]
        : schema.items
      check(item, own, `${path}[${index}]`, root, depth + 1, errors)
    })
  }
}

/**
 * What is wrong with `value` against a JSON Schema, one line per problem.
 * Extra fields are not an error here: the contract comparison names those.
 */
export const validateAgainstSchema = (
  value: unknown,
  schema: unknown
): string[] => {
  const errors: string[] = []
  check(value, schema, '$', isRecord(schema) ? schema : {}, 0, errors)
  return errors
}
