import { existsSync, readFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { serializeSecretsTypes } from '../functions/wirings/secrets/serialize-secrets-types.js'
import { serializeVariablesTypes } from '../functions/wirings/variables/serialize-variables-types.js'
import type { CLILogger } from '../services/cli-logger.service.js'
import { analyticsSchemasFile } from './analytics-schemas-file.js'
import { writeFileInDir } from './file-writer.js'

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs']

const resolveSource = (from: string, specifier: string): string | undefined => {
  const base = resolve(dirname(from), specifier).replace(/\.[cm]?js$/, '')
  return [
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => `${base}/index${extension}`),
  ].find(existsSync)
}

const escape = (name: string): string => name.replace(/\$/g, '\\$')

/**
 * Whether `source` may still export `name`. Text rather than a parse, because
 * this runs on every `pikku all` and the compiler is not otherwise loaded by it,
 * and a wrong "no" costs nothing: the leaf is rewritten in the same run anyway.
 */
const mayExport = (source: string, name: string): boolean => {
  const id = escape(name)
  return (
    /^\s*export\s*\*/m.test(source) ||
    new RegExp(
      `export\\s+(?:declare\\s+)?(?:const|let|var|function|async\\s+function|class|enum|type|interface)\\s+${id}\\b`
    ).test(source) ||
    new RegExp(`export\\s*(?:type\\s*)?\\{[^}]*\\b${id}\\b[^}]*\\}`).test(
      source
    )
  )
}

const COMMENTS = /\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm

/**
 * Whether `source` may still declare the object key `key`. Comments go first:
 * the starter's analytics.ts names its placeholder events in prose, and a key
 * that survives only there must read as gone.
 */
const mayDeclareKey = (source: string, key: string): boolean =>
  new RegExp(`(?:^|[{,\\s])['"]?${escape(key)}['"]?\\s*[:,}]`, 'm').test(
    source.replace(COMMENTS, '')
  )

const VALUE_IMPORT = /^import\s+(?:\{([^}]*)\}\s+from\s+)?'(\.[^']+)'/gm

/**
 * True when `file` imports a relative module or a name that no longer exists,
 * or reads `imported['key']` for a key the import no longer declares.
 */
export const hasStaleImport = (file: string): boolean => {
  if (!existsSync(file)) return false
  const generated = readFileSync(file, 'utf8')
  for (const [, names, specifier] of generated.matchAll(VALUE_IMPORT)) {
    if (specifier!.endsWith('.json')) continue
    const source = resolveSource(file, specifier!)
    if (!source) return true
    const text = readFileSync(source, 'utf8')
    const imported = (names ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && !name.startsWith('type '))
      .map((name) => name.split(/\s+as\s+/))
    if (imported.some(([name]) => !mayExport(text, name!))) return true
    for (const [name, alias = name] of imported) {
      const keyed = new RegExp(`\\b${escape(alias!)}\\['([^']+)'\\]`, 'g')
      for (const [, key] of generated.matchAll(keyed)) {
        if (!mayDeclareKey(text, key!)) return true
      }
    }
  }
  return false
}

/**
 * Removes what a run would otherwise read back from the run before it, so that
 * what `pikku all` derives comes from source.
 *
 * The analytics schemas module reads each event off the declaration, so a
 * removed event throws as it loads, the schema conversion fails, and the run
 * stops before the step that would rewrite it. The custom types carry the same
 * events and are part of the program being inspected, so they go with it. Both
 * only when stale: their absence costs another inspection, about 1.5s a run on
 * a real project, and the ingest and function type steps write them anyway.
 *
 * Empties the variable and secret leaves when they import what the project no
 * longer has. Reading any zod schema loads `#pikku/function`, which loads these
 * two as values, so a removed variable fails every schema in the inspection that
 * would have rewritten them: `pikku all` could not get past its own output. Empty
 * is enough, because this same run writes them in full.
 */
export const repairStaleLeaves = async (
  logger: CLILogger,
  {
    variablesFile,
    secretsFile,
    analyticsFile,
    customTypesDeclarationFile,
    packageMappings,
  }: {
    variablesFile?: string
    secretsFile?: string
    analyticsFile?: string
    customTypesDeclarationFile?: string
    packageMappings: Record<string, string>
  }
): Promise<void> => {
  const analyticsSchemas = analyticsSchemasFile(analyticsFile)
  if (analyticsSchemas && hasStaleImport(analyticsSchemas)) {
    logger.debug(`• Removing stale ${analyticsSchemas}`)
    await rm(analyticsSchemas, { force: true })
    if (customTypesDeclarationFile) {
      await rm(customTypesDeclarationFile, { force: true })
    }
  }
  if (variablesFile && hasStaleImport(variablesFile)) {
    logger.debug(`• Rewriting stale ${variablesFile}`)
    await writeFileInDir(
      logger,
      variablesFile,
      serializeVariablesTypes({
        definitions: [],
        schemaLookup: new Map(),
        variablesFile,
        packageMappings,
      })
    )
  }
  if (secretsFile && hasStaleImport(secretsFile)) {
    logger.debug(`• Rewriting stale ${secretsFile}`)
    await writeFileInDir(
      logger,
      secretsFile,
      serializeSecretsTypes({
        definitions: [],
        schemaLookup: new Map(),
        secretsFile,
        packageMappings,
      })
    )
  }
}
