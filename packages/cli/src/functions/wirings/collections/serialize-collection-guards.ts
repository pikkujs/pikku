/**
 * What stands in front of a generated function, and the helpers both
 * generators, over the app's tables and over an addon's handlers, share.
 */
import { valueKind } from './collection-columns.js'
import type {
  CollectionCheck,
  CollectionModel,
} from './collection-model.types.js'
import { pascal } from './collection-names.js'

export type Alias = (check: CollectionCheck) => string

export const holder = (collection: string, operation: string) =>
  `holdsCollection${pascal(collection)}${pascal(operation)}`

/** A permission that reads the caller's grants again and wants these. */
export const holds = (collection: string, operation: string) => {
  const scopes = [...new Set(['read', operation])]
    .map((op) => `'collections:${collection}:${op}'`)
    .join(', ')
  return `const ${holder(collection, operation)} = pikkuAuth(async ({ scopeService }, session) =>
  collectionHolds([${scopes}], { scopeService }, session)
)`
}

/**
 * The scopes and the checks of one operation, all of which must pass. A write
 * asks for its grants a second time, read now: a session cache may still hold
 * one that has been revoked.
 */
export const guards = (
  collection: CollectionModel,
  operation: string,
  alias: Alias
): string => {
  const { name, checks } = collection
  const scopes = [...new Set(['read', operation])].map(
    (op) => `'collections:${name}:${op}'`
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
      ? [`  permissions: { collections: [${required.join(', ')}] },`]
      : []),
  ].join('\n')
}

export const upperSnake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export const kinds = (collection: CollectionModel, columns: string[]) =>
  `{ ${columns.map((c) => `${c}: '${valueKind(collection.columns[c]!)}'`).join(', ')} } as const`
