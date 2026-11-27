import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type { TableAnnotations, TablesDeclaration } from '@pikku/core/db'
import { addonResolutionDirs, createAddonResolver } from '@pikku/inspector'
import { compileTables } from '@pikku/kysely'
import { snakeCase } from './snake-case.js'
import { APP_TABLES_SOURCE } from './migration-provenance.js'
import {
  loadTableDeclaration,
  parseDeclaration,
  TABLES_FILE,
  type LoadedDeclaration,
} from './table-declaration.js'

/**
 * Where an addon publishes its table declaration, relative to its package root.
 *
 * One more channel beside `.pikku/function`, `.pikku/scopes` and the rest, so a
 * consumer reaches it the same way they do: through the package name, never a
 * path into somebody else's tree.
 */
export const ADDON_DB_ARTIFACT = '.pikku/db/pikku-db-meta.gen.json'

/** An addon as the consumer wired it. */
export interface AddonDeclaration {
  package: string
  /**
   * A `wireRemoteAddon` addon runs on another host, against that host's
   * database. Its tables are not this project's to create.
   */
  remote?: boolean
  /** Absolute path of the file that wires it; resolution starts from its package. */
  file?: string
  /** The name it is wired under, which its tables are prefixed with. */
  name?: string
}

/** The addons a project wires, from its inspector state. The one place that reads them for the db commands. */
export const wiredAddons = (state: {
  rpc: {
    wireAddonDeclarations: Map<
      string,
      { package: string; remote?: boolean; file?: string }
    >
  }
}): AddonDeclaration[] =>
  [...state.rpc.wireAddonDeclarations.entries()].map(
    ([name, { package: pkg, remote, file }]) => ({
      package: pkg,
      remote,
      file,
      name,
    })
  )

/** Every table an addon creates starts with its name, so two addons, or an addon and the app, cannot collide. */
export const addonTablePrefix = (name: string): string =>
  `${name.replace(/[^a-zA-Z0-9]+/g, '_')}_`

/** The tables an addon declares without its prefix. */
const unprefixedTables = (tables: object, name: string): string[] => {
  const prefix = snakeCase(addonTablePrefix(name))
  return Object.keys(tables).filter((t) => !snakeCase(t).startsWith(prefix))
}

const LEGACY_DIRS = ['sqlite', 'postgres', 'mysql']

/**
 * Publish this package's table declaration so a project consuming it as an addon
 * can create its tables.
 *
 * The declaration is the package's own `db/tables.ts`, checked by the same code
 * as an app's and written as plain JSON, so one file serves every engine. An
 * addon with no tables writes `{}`: the consumer reads an absent file as a
 * package that cannot say, which is a broken publish rather than a quiet no.
 */
export async function writeAddonDeclaration(
  rootDir: string,
  outDir: string
): Promise<{ file: string; tables: string[] }> {
  const declaration = await loadTableDeclaration(rootDir)
  if (!declaration) {
    const legacy = LEGACY_DIRS.filter((d) => existsSync(join(rootDir, 'db', d)))
    if (legacy.length > 0) {
      throw new Error(
        `This addon has SQL in db/${legacy.join(', db/')} but no ${TABLES_FILE}. Addons declare their tables with defineTables in ${TABLES_FILE}; the SQL is no longer published.`
      )
    }
  }
  if (declaration && Object.keys(declaration.declareOnly).length > 0) {
    throw new Error(
      `${TABLES_FILE}: declareOnly is not allowed in an addon (${Object.keys(declaration.declareOnly).join(', ')}): the consumer's migrations would have to create it.`
    )
  }
  const tables = declaration?.schema.tables ?? {}
  const file = join(outDir, 'db', 'pikku-db-meta.gen.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(tables, null, 2)}\n`, 'utf8')
  return { file, tables: Object.keys(tables) }
}

/** What an addon published before it published its declaration: SQL per dialect. */
const isOldShape = (published: Record<string, unknown>): boolean =>
  Object.values(published).some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      !('columns' in entry) &&
      typeof (entry as { sql?: unknown }).sql === 'string' &&
      typeof (entry as { tables?: unknown }).tables === 'object'
  )

/** What a published declaration may weigh, so a bad build cannot make the CLI read without bound. */
const MAX_ARTIFACT_BYTES = 1_000_000
const MAX_ARTIFACT_TABLES = 1000

/** Read, check and prefix-check what one wired addon published. */
function readAddonDeclaration(
  rootDir: string,
  addon: AddonDeclaration
): LoadedDeclaration {
  let artifactPath: string
  try {
    artifactPath = createAddonResolver(
      addonResolutionDirs(rootDir, addon.file)
    ).resolve(`${addon.package}/${ADDON_DB_ARTIFACT}`)
  } catch {
    // Every addon publishes this file, and one with no tables publishes `{}`.
    // Absence is therefore never "contributes nothing": it is a package that
    // cannot say, and the addon's functions would query tables nobody created.
    throw new Error(
      `The '${addon.package}' addon does not publish ${ADDON_DB_ARTIFACT}, so ` +
        'there is no way to tell whether it ships tables. Build it with a ' +
        'current CLI (`pikku all` writes the file, empty when there are no ' +
        'tables), and make sure the package exports and packs it:\n' +
        `  "exports": { "./${ADDON_DB_ARTIFACT}": "./dist/.pikku/addon/db/pikku-db-meta.gen.json" }\n` +
        '  "files": ["dist"]'
    )
  }

  const size = statSync(artifactPath).size
  if (size > MAX_ARTIFACT_BYTES) {
    throw new Error(
      `The '${addon.package}' addon publishes a ${ADDON_DB_ARTIFACT} larger than 1 MB (${size} bytes), which is not read. Rebuild the addon.`
    )
  }
  let published: unknown
  try {
    published = JSON.parse(readFileSync(artifactPath, 'utf8'))
  } catch (error: any) {
    throw new Error(
      `The '${addon.package}' addon publishes an unreadable ${ADDON_DB_ARTIFACT} ` +
        `(${artifactPath}): ${error.message}. Rebuild the addon.`
    )
  }
  if (
    typeof published !== 'object' ||
    published === null ||
    Array.isArray(published)
  ) {
    throw new Error(
      `The '${addon.package}' addon publishes a ${ADDON_DB_ARTIFACT} that is not an object of tables. Rebuild the addon.`
    )
  }
  if (Object.keys(published).length > MAX_ARTIFACT_TABLES) {
    throw new Error(
      `The '${addon.package}' addon publishes more than ${MAX_ARTIFACT_TABLES} tables, which is not read. Rebuild the addon.`
    )
  }
  if (isOldShape(published as Record<string, unknown>)) {
    throw new Error(
      `The '${addon.package}' addon publishes its schema as SQL per dialect, which is no longer read. Rebuild or upgrade the addon so it publishes its table declaration.`
    )
  }

  const label = `the '${addon.package}' addon`
  const declaration = parseDeclaration(
    published as Record<string, unknown>,
    label
  )
  for (const [table, entry] of Object.entries(declaration.schema.tables)) {
    for (const [column, spec] of Object.entries(entry.columns)) {
      if ((spec as { security?: string }).security === 'public') {
        throw new Error(
          `${label} declares ${table}.${column} with security 'public'. An addon's columns are private; the app can expose it in its own declaration.`
        )
      }
    }
  }
  const declaredOnly = Object.keys(declaration.declareOnly)
  if (declaredOnly.length > 0) {
    throw new Error(
      `${label} declares ${declaredOnly.join(', ')} with declareOnly, which an addon may not: its tables are created from this declaration.`
    )
  }
  if (addon.name) {
    const offenders = unprefixedTables(declaration.schema.tables, addon.name)
    if (offenders.length > 0) {
      throw new Error(
        `The '${addon.name}' addon declares tables without its prefix ` +
          `'${addonTablePrefix(addon.name)}': ${offenders.join(', ')}. ` +
          'Rename them in its db/tables.ts, so they cannot collide with the app or another addon.'
      )
    }
  }
  return declaration
}

/**
 * The declaration of every wired addon that runs against this project's
 * database. A remote addon contributes nothing, and an addon wired twice
 * contributes once.
 */
export function addonDeclarations(
  rootDir: string,
  addons: AddonDeclaration[]
): { addon: AddonDeclaration; declaration: LoadedDeclaration }[] {
  const seen = new Set<string>()
  const out: { addon: AddonDeclaration; declaration: LoadedDeclaration }[] = []
  for (const addon of addons) {
    if (addon.remote || seen.has(addon.package)) continue
    seen.add(addon.package)
    out.push({ addon, declaration: readAddonDeclaration(rootDir, addon) })
  }
  return out
}

/**
 * The app's declaration and every addon's, as one. A table named twice is
 * refused, and the merged declaration is compiled so a reference from one to
 * another is checked.
 */

export function mergeDeclarations(
  app: LoadedDeclaration | null,
  addons: { addon: AddonDeclaration; declaration: LoadedDeclaration }[]
): LoadedDeclaration | null {
  if (
    addons.every(
      ({ declaration }) => !Object.keys(declaration.schema.tables).length
    )
  ) {
    return app
  }
  const tables: TablesDeclaration = { ...app?.schema.tables }
  const annotations: TableAnnotations = { ...app?.annotations }
  const renames = [...(app?.renames ?? [])]
  const renamedTables = [...(app?.renamedTables ?? [])]
  const owners = new Map<string, string>()
  const attributed: Record<string, string> = {}
  for (const name of Object.keys({
    ...app?.schema.tables,
    ...app?.declareOnly,
  })) {
    owners.set(snakeCase(name), TABLES_FILE)
  }
  for (const { addon, declaration } of addons) {
    const owner = `the '${addon.package}' addon`
    for (const name of Object.keys(declaration.schema.tables)) {
      const physical = snakeCase(name)
      const first = owners.get(physical)
      if (first) {
        throw new Error(
          `${physical} is declared by both ${first} and ${owner}. A table has one owner: rename it in one of them.`
        )
      }
      owners.set(physical, owner)
    }
    for (const name of Object.keys(declaration.schema.tables)) {
      attributed[snakeCase(name)] = owner
    }
    Object.assign(tables, declaration.schema.tables)
    Object.assign(annotations, declaration.annotations)
    renames.push(...declaration.renames)
    renamedTables.push(...declaration.renamedTables)
  }
  const declareOnly = app?.declareOnly ?? {}
  try {
    compileTables({ ...tables, ...declareOnly })
  } catch (error: any) {
    throw new Error(`The merged table declaration is invalid: ${error.message}`)
  }
  return {
    schema: { name: APP_TABLES_SOURCE, tables },
    declareOnly,
    annotations,
    renames,
    renamedTables,
    owners: attributed,
  }
}

/** `db/tables.ts` merged with what the wired addons declare: what every db command works from. */
export async function loadMergedDeclaration(
  rootDir: string,
  addons: AddonDeclaration[] = []
): Promise<LoadedDeclaration | null> {
  return mergeDeclarations(
    await loadTableDeclaration(rootDir),
    addonDeclarations(rootDir, addons)
  )
}
