import { join } from 'node:path'
import {
  loadTableDeclaration,
  TABLES_FILE,
} from '../../db/table-declaration.js'
import type { AddonDeclaration } from '../../db/addon-declarations.js'
import type { Config } from '../../../../types/application-types.js'
import { buildCmsModel } from './build-cms-model.js'
import { cmsAddonSources } from './cms-addon.js'
import type { CmsModel } from './cms-model.types.js'
import { CMS_FILE, loadCmsDeclaration } from './load-cms-declaration.js'

/** The files `pikku all` writes for a project with a `db/cms.ts`. */
export const cmsFiles = (config: Pick<Config, 'resolvedScaffoldDir'>) => {
  const dir = join(config.resolvedScaffoldDir!, 'cms')
  return {
    scopes: join(dir, 'cms-scopes.gen.ts'),
    schemas: join(dir, 'cms.schemas.gen.ts'),
    runtime: join(dir, 'cms-runtime.gen.ts'),
    functions: join(dir, 'cms.gen.ts'),
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The checked CMS of a project, or `null` when it has none. The wired addons are
 * asked for only when the declaration needs them: a collection with `from`, or
 * one over a table the app does not create itself, which an addon may own.
 */
export const loadCmsModel = async (
  config: Pick<Config, 'rootDir' | 'content'>,
  wired: () => Promise<AddonDeclaration[]>
): Promise<CmsModel | null> => {
  const declaration = await loadCmsDeclaration(config.rootDir)
  if (!declaration) return null
  const loaded = await loadTableDeclaration(config.rootDir)
  const from = Object.values(declaration).flatMap((entry) =>
    isRecord(entry) && typeof entry.from === 'string' ? [entry.from] : []
  )
  if (!loaded && from.length === 0) {
    throw new Error(
      `${CMS_FILE} declares collections over tables, and the project has no ${TABLES_FILE}.`
    )
  }
  const asksAddons =
    from.length > 0 ||
    Object.keys(declaration).some(
      (name) => !Object.hasOwn(loaded?.schema.tables ?? {}, name)
    )
  return buildCmsModel({
    declaration,
    tables: { ...loaded?.schema.tables, ...loaded?.declareOnly },
    buckets: config.content?.buckets ?? [],
    addons: asksAddons
      ? cmsAddonSources(config.rootDir, await wired(), new Set(from))
      : undefined,
  })
}
