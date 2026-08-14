/**
 * Field-level compatibility diff between two JSON Schemas.
 *
 * Whether a change breaks anyone depends on which way the data flows, so every
 * comparison carries a `direction`. An input schema is contravariant — the
 * caller writes it, so tightening (a new required field, a narrower enum) is
 * what breaks. An output schema is covariant — the caller reads it, so
 * loosening (a field that may now be absent, a new enum member the consumer
 * never handled) is what breaks. Removing a field breaks in both directions.
 */

export type SchemaDirection = 'input' | 'output'

export interface SchemaChange {
  /** Dotted path from the schema root, `[]` marking array items. */
  path: string
  breaking: boolean
  reason: string
}

type Schema = Record<string, any>

const isSchema = (value: unknown): value is Schema =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const joinPath = (parent: string, key: string) =>
  parent ? `${parent}.${key}` : key

/**
 * Resolve local `#/definitions/...` / `#/$defs/...` pointers against the root
 * they were authored in. Anything non-local is left alone — an unresolvable
 * `$ref` is compared as the opaque object it is rather than guessed at.
 */
function deref(schema: Schema, root: Schema, seen: Set<string>): Schema {
  let current = schema
  while (typeof current.$ref === 'string') {
    const ref: string = current.$ref
    if (!ref.startsWith('#/') || seen.has(ref)) return current
    seen.add(ref)
    let target: unknown = root
    for (const rawSegment of ref.slice(2).split('/')) {
      const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~')
      if (!isSchema(target)) return current
      target = (target as Schema)[segment]
    }
    if (!isSchema(target)) return current
    current = target
  }
  return current
}

const typeOf = (schema: Schema): string | undefined => {
  const type = schema.type
  if (typeof type === 'string') return type
  if (Array.isArray(type)) return [...type].sort().join('|')
  return undefined
}

const requiredSet = (schema: Schema): Set<string> =>
  new Set(Array.isArray(schema.required) ? schema.required : [])

const propertiesOf = (schema: Schema): Schema =>
  isSchema(schema.properties) ? schema.properties : {}

/**
 * `additionalProperties: false` is what makes an unknown key an error, so a
 * removed input field only breaks callers when the schema is closed.
 */
const isClosed = (schema: Schema): boolean =>
  schema.additionalProperties === false

function compare(
  beforeRaw: Schema,
  afterRaw: Schema,
  direction: SchemaDirection,
  path: string,
  beforeRoot: Schema,
  afterRoot: Schema,
  depth: number,
  changes: SchemaChange[]
): void {
  // Deep enough to have left any sane generated schema behind; a cyclic pair of
  // `$ref`s that dodges the per-branch guard stops here rather than recursing.
  if (depth > 24) return

  const before = deref(beforeRaw, beforeRoot, new Set())
  const after = deref(afterRaw, afterRoot, new Set())

  const beforeType = typeOf(before)
  const afterType = typeOf(after)
  if (beforeType !== afterType && (beforeType || afterType)) {
    changes.push({
      path,
      breaking: true,
      reason: `type changed from ${beforeType ?? 'unknown'} to ${afterType ?? 'unknown'}`,
    })
    return
  }

  compareEnums(before, after, direction, path, changes)

  const beforeProps = propertiesOf(before)
  const afterProps = propertiesOf(after)
  const beforeRequired = requiredSet(before)
  const afterRequired = requiredSet(after)

  for (const key of Object.keys(beforeProps)) {
    const childPath = joinPath(path, key)
    if (!(key in afterProps)) {
      // Dropping an input field only breaks callers that still send it, which
      // is only an error against a closed schema.
      const breaking = direction === 'output' || isClosed(after)
      changes.push({
        path: childPath,
        breaking,
        reason: breaking
          ? 'field removed'
          : 'field removed (schema accepts additional properties)',
      })
      continue
    }
    if (beforeRequired.has(key) && !afterRequired.has(key)) {
      changes.push({
        path: childPath,
        breaking: direction === 'output',
        reason:
          direction === 'output'
            ? 'field is no longer guaranteed to be present'
            : 'field became optional',
      })
    } else if (!beforeRequired.has(key) && afterRequired.has(key)) {
      changes.push({
        path: childPath,
        breaking: direction === 'input',
        reason:
          direction === 'input'
            ? 'optional field became required'
            : 'field is now always present',
      })
    }
    compare(
      beforeProps[key],
      afterProps[key],
      direction,
      childPath,
      beforeRoot,
      afterRoot,
      depth + 1,
      changes
    )
  }

  for (const key of Object.keys(afterProps)) {
    if (key in beforeProps) continue
    const childPath = joinPath(path, key)
    const required = afterRequired.has(key)
    const breaking = direction === 'input' && required
    changes.push({
      path: childPath,
      breaking,
      reason: breaking
        ? 'required field added'
        : `${required ? 'required' : 'optional'} field added`,
    })
  }

  if (isSchema(before.items) && isSchema(after.items)) {
    compare(
      before.items,
      after.items,
      direction,
      `${path}[]`,
      beforeRoot,
      afterRoot,
      depth + 1,
      changes
    )
  }
}

function compareEnums(
  before: Schema,
  after: Schema,
  direction: SchemaDirection,
  path: string,
  changes: SchemaChange[]
): void {
  if (!Array.isArray(before.enum) || !Array.isArray(after.enum)) return
  const beforeValues = before.enum.map((v: unknown) => JSON.stringify(v))
  const afterValues = new Set(after.enum.map((v: unknown) => JSON.stringify(v)))
  const beforeSet = new Set(beforeValues)

  const removed = beforeValues.filter((v) => !afterValues.has(v))
  const added = after.enum
    .map((v: unknown) => JSON.stringify(v))
    .filter((v: string) => !beforeSet.has(v))

  if (removed.length > 0) {
    changes.push({
      path,
      // A value the caller may still send is now rejected; a value the caller
      // will simply never see again is not their problem.
      breaking: direction === 'input',
      reason: `enum values removed: ${removed.join(', ')}`,
    })
  }
  if (added.length > 0) {
    changes.push({
      path,
      // A new value in a response reaches consumers that never handled it.
      breaking: direction === 'output',
      reason: `enum values added: ${added.join(', ')}`,
    })
  }
}

/**
 * Diff two schemas, either of which may be absent — a function that gained or
 * lost an input/output entirely is a real compatibility event, not a no-op.
 */
export function diffSchema(
  before: unknown,
  after: unknown,
  direction: SchemaDirection
): SchemaChange[] {
  const hasBefore = isSchema(before)
  const hasAfter = isSchema(after)

  if (!hasBefore && !hasAfter) return []

  if (!hasBefore && hasAfter) {
    const required = requiredSet(after as Schema)
    const breaking = direction === 'input' && required.size > 0
    return [
      {
        path: '',
        breaking,
        reason: breaking
          ? `${direction} schema added with required fields: ${[...required].join(', ')}`
          : `${direction} schema added`,
      },
    ]
  }

  if (hasBefore && !hasAfter) {
    return [
      {
        path: '',
        breaking: direction === 'output',
        reason: `${direction} schema removed`,
      },
    ]
  }

  const changes: SchemaChange[] = []
  compare(
    before as Schema,
    after as Schema,
    direction,
    '',
    before as Schema,
    after as Schema,
    0,
    changes
  )
  return changes
}
