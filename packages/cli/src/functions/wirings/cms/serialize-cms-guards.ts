/**
 * What stands in front of a generated function, and the helpers both
 * generators, over the app's tables and over an addon's handlers, share.
 */
import { valueKind } from './cms-columns.js'
import type { CmsCheck, CmsModelCollection } from './cms-model.types.js'
import { pascal } from './cms-names.js'

export type Alias = (check: CmsCheck) => string

export const holder = (collection: string, operation: string) =>
  `holdsCms${pascal(collection)}${pascal(operation)}`

/** A permission that reads the caller's grants again and wants these. */
export const holds = (collection: string, operation: string) => {
  const scopes = [...new Set(['read', operation])]
    .map((op) => `'cms:${collection}:${op}'`)
    .join(', ')
  return `const ${holder(collection, operation)} = pikkuAuth(async ({ scopeService }, session) =>
  cmsHolds([${scopes}], { scopeService }, session)
)`
}

/**
 * The scopes and the checks of one operation, all of which must pass. A write
 * asks for its grants a second time, read now: a session cache may still hold
 * one that has been revoked.
 */
export const guards = (
  collection: CmsModelCollection,
  operation: string,
  alias: Alias
): string => {
  const { name, checks } = collection
  const scopes = [...new Set(['read', operation])].map(
    (op) => `'cms:${name}:${op}'`
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
      ? [`  permissions: { cms: [${required.join(', ')}] },`]
      : []),
  ].join('\n')
}

export const upperSnake = (name: string) =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()

export const kinds = (collection: CmsModelCollection, columns: string[]) =>
  `{ ${columns.map((c) => `${c}: '${valueKind(collection.columns[c]!)}'`).join(', ')} } as const`
