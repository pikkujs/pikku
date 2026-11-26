import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadFreshUserModule } from '../../commands/load-user-project.js'

export const CRUD_FILE = 'db/crud.ts'

const CRUD_EXPORT = 'crud'

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Where a value stops being plain data: strings, numbers, booleans, arrays and
 * plain objects. Everything else would be lost when the declaration is
 * published as JSON, or run code the declaration is not meant to hold.
 */
export const nonDataPaths = (
  value: unknown,
  path: string,
  seen = new Set<unknown>()
): string[] => {
  if (
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return []
  }
  if (!Array.isArray(value) && !isPlainObject(value)) return [path]
  if (seen.has(value)) return [path]
  seen.add(value)
  const found = Object.entries(value).flatMap(([key, entry]) =>
    nonDataPaths(entry, `${path}.${key}`, seen)
  )
  seen.delete(value)
  return found
}

/** Read `db/crud.ts`, or `null` when the project declares no CRUD. */
export const loadCrudDeclaration = async (
  rootDir: string
): Promise<Record<string, unknown> | null> => {
  const file = join(rootDir, CRUD_FILE)
  if (!existsSync(file)) return null

  let exported: unknown
  try {
    exported = (await loadFreshUserModule(file))[CRUD_EXPORT]
  } catch (error: any) {
    throw new Error(`${CRUD_FILE} could not be loaded: ${error.message}`)
  }
  if (!isPlainObject(exported)) {
    throw new Error(
      `${CRUD_FILE} must export \`const ${CRUD_EXPORT} = defineCrud<typeof tables>()({ ... })\`, with \`defineCrud\` from @pikku/core/crud.`
    )
  }
  const notData = nonDataPaths(exported, CRUD_EXPORT)
  if (notData.length > 0) {
    throw new Error(
      `${CRUD_FILE} must hold plain data, and ${notData.join(', ')} is not.`
    )
  }
  return exported
}
