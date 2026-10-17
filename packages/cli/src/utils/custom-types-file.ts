import type { TypesMap } from '@pikku/inspector'
import { customTypeNames, generateCustomTypes } from '@pikku/inspector/state'
import type { CLILogger } from '../services/cli-logger.service.js'
import { getFileImportRelativePath } from './file-import-path.js'
import { writeFileInDir } from './file-writer.js'

/**
 * The shared custom-types file: every custom type declared once, with each of
 * its imports resolved relative to the file itself.
 */
export const serializeCustomTypesFile = (
  customTypesFile: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap
): string => {
  const content = generateCustomTypes(typesMap, new Set(), {
    resolveImportPath: (path) =>
      getFileImportRelativePath(customTypesFile, path, packageMappings),
  })
  return `/**
 * Custom types shared by every generated typed map.
 */

${content}
`
}

/**
 * Writes the shared custom-types file. Every map command calls this before
 * writing its own map, so whichever subset of commands runs, the file a map
 * imports from exists and matches the types map that map was serialized from.
 * The content is a pure function of the types map, so repeat writes within one
 * run are identical.
 */
export const writeCustomTypesFile = async (
  logger: CLILogger,
  customTypesFile: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap
) => {
  await writeFileInDir(
    logger,
    customTypesFile,
    serializeCustomTypesFile(customTypesFile, packageMappings, typesMap),
    { logWrite: false }
  )
}

/**
 * The namespace a map imports the shared custom types under. Prefixed so it
 * cannot collide with a type a project names itself.
 */
const CUSTOM_TYPES_NAMESPACE = '__PikkuCustomTypes'

/**
 * What a map emits in place of its own copy of the custom types: one
 * type-only namespace import of the shared file, and a one-line alias per
 * custom type, so each name stays declared and exported by the map exactly as
 * it was when the map carried the full declaration.
 */
export const serializeCustomTypesImport = (
  relativeToPath: string,
  customTypesFile: string,
  packageMappings: Record<string, string>,
  typesMap: TypesMap
): string => {
  const names = customTypeNames(typesMap)
  if (names.length === 0) {
    return ''
  }
  const specifier = getFileImportRelativePath(
    relativeToPath,
    customTypesFile,
    packageMappings
  )
  return [
    `import type * as ${CUSTOM_TYPES_NAMESPACE} from '${specifier}'`,
    ...names.map(
      (name) => `export type ${name} = ${CUSTOM_TYPES_NAMESPACE}.${name}`
    ),
  ].join('\n')
}
