import { writeFileInDir } from './file-writer.js'
import { mkdir, readdir, unlink, writeFile } from 'fs/promises'
import type { JSONValue } from '@pikku/core'
import type { CLILogger } from '../services/cli-logger.service.js'

const SCHEMA_FILE_SUFFIX = '.schema.json'

function toValidIdentifier(name: string): string {
  let result = name.replace(/[-./: ]/g, '_')
  if (/^\d/.test(result)) {
    result = '_' + result
  }
  return result
}

/**
 * Delete `<schemaParentDir>/schemas/*.schema.json` for schemas this run did not
 * generate.
 *
 * Codegen rewrites `register.gen.ts` from scratch every run, so a schema that is no
 * longer required stops being registered — but its JSON file used to stay on disk
 * forever. That orphan is not inert: it is the artifact everything reaches for when
 * asking "what does the server validate against?", and it answers with the shape the
 * function had at some earlier point. Tooling reading it concludes the schema is fine
 * while the running server disagrees, which is a dead end that reads as "the server is
 * stale" and cannot be resolved by regenerating or restarting.
 *
 * Keeping the directory in step with `register.gen.ts` is the whole fix: if it is not
 * imported there, it must not be on disk to be misread.
 */
async function pruneOrphanedSchemaFiles(
  logger: CLILogger,
  schemaParentDir: string,
  keep: ReadonlySet<string>
) {
  const dir = `${schemaParentDir}/schemas`
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch (e) {
    // No schemas dir yet (first run, or none were ever generated) — nothing to prune.
    // Anything else (permissions, IO) means we do NOT know what is on disk, and
    // reporting a clean generation over an unread directory is the exact false
    // "everything is registered" claim this prune exists to stop.
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return
    }
    throw e
  }

  const orphans = entries.filter(
    (entry) =>
      entry.endsWith(SCHEMA_FILE_SUFFIX) &&
      !keep.has(entry.slice(0, -SCHEMA_FILE_SUFFIX.length))
  )

  await Promise.all(
    orphans.map(async (orphan) => {
      try {
        await unlink(`${dir}/${orphan}`)
      } catch (e) {
        // A file we cannot remove is stale output, not a reason to fail the build —
        // but say so, because it will keep being read as if it were current.
        logger.error(`• Could not remove stale schema ${orphan}: ${e}`)
      }
    })
  )

  if (orphans.length > 0) {
    logger.info(`• Removed ${orphans.length} stale schema file(s).\x1b[0m`)
  }
}

export async function saveSchemas(
  logger: CLILogger,
  schemaParentDir: string,
  schemas: Record<string, JSONValue>,
  requiredSchemas: Set<string>,
  supportsImportAttributes: boolean,
  packageName?: string | null
) {
  if (requiredSchemas.size === 0) {
    await writeFileInDir(
      logger,
      `${schemaParentDir}/register.gen.ts`,
      'export const empty = null;'
    )
    // Every file in schemas/ is now an orphan: register.gen.ts registers nothing, so
    // leaving them would be exactly the misleading state this prune exists to prevent.
    await pruneOrphanedSchemaFiles(logger, schemaParentDir, new Set())
    logger.info(`• Skipping schemas since none found.\x1b[0m`)
    return
  }

  await mkdir(`${schemaParentDir}/schemas`, { recursive: true })
  await Promise.all(
    Object.entries(schemas).map(async ([schemaName, schema]) => {
      if (requiredSchemas.has(schemaName)) {
        await writeFile(
          `${schemaParentDir}/schemas/${schemaName}.schema.json`,
          JSON.stringify(schema),
          'utf-8'
        )
      }
    })
  )

  // Sort so register.gen.ts is byte-identical across runs — requiredSchemas is
  // a Set in (nondeterministic) traversal-insertion order.
  const availableSchemas = Array.from(requiredSchemas)
    // Presence, not truthiness: `false` is a legal JSON Schema (it rejects everything),
    // and dropping it here would unregister the schema AND prune its file.
    .filter((schema) => schemas[schema] !== undefined)
    .sort()

  // Keep exactly what register.gen.ts is about to import — the two must not disagree.
  await pruneOrphanedSchemaFiles(logger, schemaParentDir, new Set(availableSchemas))

  const packageNameArg = packageName ? `, '${packageName}'` : ''

  const schemaImports = availableSchemas
    .map((schema) => {
      const identifier = toValidIdentifier(schema)
      return `
import * as ${identifier} from './schemas/${schema}.schema.json' ${supportsImportAttributes ? `with { type: 'json' }` : ''}
addSchema('${schema}', ${identifier}${packageNameArg})
`
    })
    .join('\n')

  const importStatement =
    availableSchemas.length > 0
      ? `import { addSchema } from '@pikku/core/schema'`
      : '// No schemas to register'

  await writeFileInDir(
    logger,
    `${schemaParentDir}/register.gen.ts`,
    `${importStatement}
${schemaImports}`,
    { logWrite: true }
  )
}
