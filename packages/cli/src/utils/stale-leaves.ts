import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { serializeSecretsTypes } from '../functions/wirings/secrets/serialize-secrets-types.js'
import { serializeVariablesTypes } from '../functions/wirings/variables/serialize-variables-types.js'
import type { CLILogger } from '../services/cli-logger.service.js'
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

const VALUE_IMPORT = /^import\s+(?:\{([^}]*)\}\s+from\s+)?'(\.[^']+)'/gm

/** True when `file` imports a relative module or a name that no longer exists. */
export const hasStaleImport = (file: string): boolean => {
  if (!existsSync(file)) return false
  for (const [, names, specifier] of readFileSync(file, 'utf8').matchAll(
    VALUE_IMPORT
  )) {
    if (specifier!.endsWith('.json')) continue
    const source = resolveSource(file, specifier!)
    if (!source) return true
    const text = readFileSync(source, 'utf8')
    const imported = (names ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name && !name.startsWith('type '))
      .map((name) => name.split(/\s+as\s+/)[0]!)
    if (imported.some((name) => !mayExport(text, name))) return true
  }
  return false
}

/**
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
    packageMappings,
  }: {
    variablesFile?: string
    secretsFile?: string
    packageMappings: Record<string, string>
  }
): Promise<void> => {
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
