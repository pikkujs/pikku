import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { loadFreshUserModule } from '../../commands/load-user-project.js'
import type {
  CmsCheck,
  CmsModel,
  CmsModelCollection,
} from './cms-model.types.js'

const isInside = (dir: string, path: string) => {
  const from = relative(dir, path)
  return from !== '' && !from.startsWith('..') && !isAbsolute(from)
}

/**
 * A check an upload also runs cannot read its input, because an upload's input
 * is not the record's: with an image field, create and edit checks must be
 * session checks too.
 */
const mustBeAuth = (collection: CmsModelCollection, operation: string) =>
  operation === 'read' ||
  ((operation === 'create' || operation === 'edit') &&
    collection.fields.some((field) => field.image))

const checkProblem = async (
  rootDir: string,
  { module, exportName }: CmsCheck,
  needsAuth: boolean
): Promise<string | undefined> => {
  const file = resolve(rootDir, module)
  if (!existsSync(file)) return `there is no file '${module}'`
  if (!isInside(realpathSync(rootDir), realpathSync(file))) {
    return `'${module}' is outside the project`
  }
  let exports: Record<string, unknown>
  try {
    exports = await loadFreshUserModule(file)
  } catch (error: any) {
    return `'${module}' could not be loaded: ${error.message}`
  }
  const check = exports[exportName]
  if (typeof check !== 'function') {
    return `'${module}' exports no check '${exportName}'`
  }
  if (needsAuth && !('__pikkuAuth' in check && check.__pikkuAuth === true)) {
    return `'${exportName}' must be a pikkuAuth, which reads the session only: it guards functions that have no record to read`
  }
  return undefined
}

/** Every app check `db/cms.ts` names exists, and is the kind its use needs. */
export const verifyCmsChecks = async (
  rootDir: string,
  model: CmsModel
): Promise<void> => {
  const problems: string[] = []
  for (const collection of model.collections) {
    for (const [operation, check] of Object.entries(collection.checks)) {
      const problem = await checkProblem(
        rootDir,
        check,
        mustBeAuth(collection, operation)
      )
      if (problem) {
        problems.push(
          `${collection.name}: permissions.${operation}: ${problem}`
        )
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`db/cms.ts: ${problems.join('; ')}.`)
  }
}
