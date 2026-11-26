/**
 * What stands in front of a generated function, and the helpers both
 * generators, over the app's tables and over an addon's handlers, share.
 */
import { valueKind } from './crud-columns.js'
import type { CrudCheck, CrudModelCollection } from './crud-model.types.js'
import { pascal } from './crud-names.js'

export type Alias = (check: CrudCheck) => string

export const holder = (collection: string, operation: string) =>
  `holdsCrud${pascal(collection)}${pascal(operation)}`

/** A permission that reads the caller's grants again and wants these. */
export const holds = (collection: string, operation: string) => {
  const scopes = [...new Set(['read', operation])]
    .map((op) => `'crud:${collection}:${op}'`)
    .join(', ')
  return `const ${holder(collection, operation)} = pikkuAuth(async ({ scopeService }, session) =>
  crudHolds([${scopes}], { scopeService }, session)
)`
}

/**
 * The scopes and the checks of one operation, all of which must pass. A write
 * asks for its grants a second time, read now: a session cache may still hold
 * one that has been revoked.
 */
export const guards = (
  collection: CrudModelCollection,
  operation: string,
  alias: Alias
): string => {
  const { name, checks } = collection
  const scopes = [...new Set(['read', operation])].map(
    (op) => `'crud:${name}:${op}'`
  )
  const required = [
    ...(operation === 'read' ? [] : [holder(name, operation)]),
    ...[...new Set(['read', operation])].flatMap((op) =>
      checks[op] ? [alias(checks[op]!)] : []
    ),
  ]
  return [
    `  scopes: [${scopes.join(', ')}],`,
    // One group: the entries of a group all have to pass.
    ...(required.length
      ? [`  permissions: { crud: [${required.join(', ')}] },`]
      : []),
  ].join('\n')
}

export const upperSnake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export const kinds = (collection: CrudModelCollection, columns: string[]) =>
  `{ ${columns.map((c) => `${c}: '${valueKind(collection.columns[c]!)}'`).join(', ')} } as const`
