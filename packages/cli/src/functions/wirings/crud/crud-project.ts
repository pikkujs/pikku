import { join } from 'node:path'
import {
  loadTableDeclaration,
  TABLES_FILE,
} from '../../db/table-declaration.js'
import type { AddonDeclaration } from '../../db/addon-declarations.js'
import type { Config } from '../../../../types/application-types.js'
import { buildCrudModel } from './build-crud-model.js'
import { crudAddonSources } from './crud-addon.js'
import type { CrudModel } from './crud-model.types.js'
import { CRUD_FILE, loadCrudDeclaration } from './load-crud-declaration.js'

/** The files `pikku all` writes for a project with a `db/crud.ts`. */
export const crudFiles = (config: Pick<Config, 'resolvedScaffoldDir'>) => {
  const dir = join(config.resolvedScaffoldDir!, 'crud')
  return {
    scopes: join(dir, 'crud-scopes.gen.ts'),
    schemas: join(dir, 'crud.schemas.gen.ts'),
    runtime: join(dir, 'crud-runtime.gen.ts'),
    functions: join(dir, 'crud.gen.ts'),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The checked CRUD collections of a project, or `null` when it has none. The wired addons are
 * asked for only when the declaration needs them: a collection with `from`, or
 * one over a table the app does not create itself, which an addon may own.
 */
export const loadCrudModel = async (
  config: Pick<Config, 'rootDir' | 'content'>,
  wired: () => Promise<AddonDeclaration[]>
): Promise<CrudModel | null> => {
  const declaration = await loadCrudDeclaration(config.rootDir)
  if (!declaration) return null
  const loaded = await loadTableDeclaration(config.rootDir)
  const from = Object.values(declaration).flatMap((entry) =>
    isRecord(entry) && typeof entry.from === 'string' ? [entry.from] : []
  )
  if (!loaded && from.length === 0) {
    throw new Error(
      `${CRUD_FILE} declares collections over tables, and the project has no ${TABLES_FILE}.`
    )
  }
  const asksAddons =
    from.length > 0 ||
    Object.keys(declaration).some(
      (name) => !Object.hasOwn(loaded?.schema.tables ?? {}, name)
    )
  return buildCrudModel({
    declaration,
    tables: { ...loaded?.schema.tables, ...loaded?.declareOnly },
    buckets: config.content?.buckets ?? [],
    addons: asksAddons
      ? crudAddonSources(config.rootDir, await wired(), new Set(from))
      : undefined,
  })
}
