import { join } from 'node:path'
import {
  loadTableDeclaration,
  TABLES_FILE,
} from '../../db/table-declaration.js'
import type { AddonDeclaration } from '../../db/addon-declarations.js'
import type { Config } from '../../../../types/application-types.js'
import { buildCollectionsModel } from './build-collection-model.js'
import { collectionAddonSources } from './collection-addon.js'
import type { CollectionsModel } from './collection-model.types.js'
import {
  COLLECTIONS_FILE,
  loadCollectionDeclaration,
} from './load-collection-declaration.js'

/** The files `pikku all` writes for a project with a `db/collections.ts`. */
export const collectionFiles = (
  config: Pick<Config, 'resolvedScaffoldDir'>
) => {
  const dir = join(config.resolvedScaffoldDir!, 'collections')
  return {
    scopes: join(dir, 'collection-scopes.gen.ts'),
    schemas: join(dir, 'collections.schemas.gen.ts'),
    runtime: join(dir, 'collection-runtime.gen.ts'),
    functions: join(dir, 'collections.gen.ts'),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The checked collections of a project, or `null` when it has none. The wired addons are
 * asked for only when the declaration needs them: a collection with `from`, or
 * one over a table the app does not create itself, which an addon may own.
 */
export const loadCollectionsModel = async (
  config: Pick<Config, 'rootDir' | 'content'>,
  wired: () => Promise<AddonDeclaration[]>
): Promise<CollectionsModel | null> => {
  const declaration = await loadCollectionDeclaration(config.rootDir)
  if (!declaration) return null
  const loaded = await loadTableDeclaration(config.rootDir)
  const from = Object.values(declaration).flatMap((entry) =>
    isRecord(entry) && typeof entry.from === 'string' ? [entry.from] : []
  )
  if (!loaded && from.length === 0) {
    throw new Error(
      `${COLLECTIONS_FILE} declares collections over tables, and the project has no ${TABLES_FILE}.`
    )
  }
  const asksAddons =
    from.length > 0 ||
    Object.keys(declaration).some(
      (name) => !Object.hasOwn(loaded?.schema.tables ?? {}, name)
    )
  return buildCollectionsModel({
    declaration,
    tables: { ...loaded?.schema.tables, ...loaded?.declareOnly },
    buckets: config.content?.buckets ?? [],
    addons: asksAddons
      ? collectionAddonSources(config.rootDir, await wired(), new Set(from))
      : undefined,
  })
}
