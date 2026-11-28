import type { CoreScopeNode } from '@pikku/core/scope'
import type {
  CollectionsModel,
  CollectionModel,
} from './collection-model.types.js'

export const COLLECTION_SCOPE_ROOT = 'collections'

/**
 * The write leaves are live: a revoked grant stops the next write, whatever a
 * cached session still says.
 */
const collectionNode = (collection: CollectionModel): CoreScopeNode => {
  const leaf = (verb: string, live?: boolean): CoreScopeNode => ({
    description: `${verb} ${collection.label}`,
    ...(live ? { live: true } : {}),
  })
  return {
    description: collection.label,
    scopes: {
      read: leaf('See'),
      ...(collection.create ? { create: leaf('Create', true) } : {}),
      ...(collection.edit ? { edit: leaf('Edit', true) } : {}),
      ...(collection.delete ? { delete: leaf('Delete', true) } : {}),
      ...Object.fromEntries(
        collection.actions.map((action) => [
          action.name,
          leaf(`${action.label}:`, true),
        ])
      ),
    },
  }
}

export const collectionScopeTree = (
  model: CollectionsModel
): CoreScopeNode => ({
  displayName: 'collection',
  description: 'Every collection. Meant for super admins only.',
  scopes: Object.fromEntries(
    model.collections.map((c) => [c.name, collectionNode(c)])
  ),
})

/**
 * An object literal with bare keys: the inspector reads a quoted key as no node
 * at all. Every key here is a setting or a collection name, both identifiers.
 */
const literal = (value: unknown, indent = ''): string => {
  if (typeof value !== 'object' || value === null) return JSON.stringify(value)
  const inner = `${indent}  `
  const entries = Object.entries(value).map(
    ([key, entry]) => `${inner}${key}: ${literal(entry, inner)},`
  )
  return `{\n${entries.join('\n')}\n${indent}}`
}

/** One literal `defineScope`, which is what the inspector reads. */
export const serializeCollectionScopes = (
  model: CollectionsModel,
  scopesLeaf: string
): string => `import { defineScope } from '${scopesLeaf}'

defineScope(${literal({ [COLLECTION_SCOPE_ROOT]: collectionScopeTree(model) })})
`
