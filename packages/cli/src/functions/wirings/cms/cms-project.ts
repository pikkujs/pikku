import { join } from 'node:path'
import {
  loadTableDeclaration,
  TABLES_FILE,
} from '../../db/table-declaration.js'
import type { Config } from '../../../../types/application-types.js'
import { buildCmsModel } from './build-cms-model.js'
import type { CmsModel } from './cms-model.types.js'
import { CMS_FILE, loadCmsDeclaration } from './load-cms-declaration.js'

/** The files `pikku all` writes for a project with a `db/cms.ts`. */
export const cmsFiles = (
  config: Pick<Config, 'resolvedScaffoldDir'>
): { scopes: string } => {
  const dir = join(config.resolvedScaffoldDir!, 'cms')
  return { scopes: join(dir, 'cms-scopes.gen.ts') }
}

/** The checked CMS of a project, or `null` when it has none. */
export const loadCmsModel = async (
  config: Pick<Config, 'rootDir' | 'content'>
): Promise<CmsModel | null> => {
  const declaration = await loadCmsDeclaration(config.rootDir)
  if (!declaration) return null
  const loaded = await loadTableDeclaration(config.rootDir)
  if (!loaded) {
    throw new Error(
      `${CMS_FILE} declares collections over tables, and the project has no ${TABLES_FILE}.`
    )
  }
  return buildCmsModel({
    declaration,
    tables: { ...loaded.schema.tables, ...loaded.declareOnly },
    buckets: config.content?.buckets ?? [],
  })
}
