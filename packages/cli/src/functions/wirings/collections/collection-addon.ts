/**
 * An addon's collections cross to the app that wires it as two things: its
 * `db/collections.ts` as JSON, published beside its table declaration, and the handlers
 * its package exports from `<package>/collections`.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, parse } from 'node:path'
import { addonResolutionDirs, createAddonResolver } from '@pikku/inspector'
import {
  addonDeclarations,
  type AddonDeclaration,
} from '../../db/addon-declarations.js'
import { loadTableDeclaration } from '../../db/table-declaration.js'
import { loadFreshUserModule } from '../../commands/load-user-project.js'
import {
  buildCollectionsModel,
  type CollectionAddonSource,
} from './build-collection-model.js'
import type {
  CollectionsModel,
  CollectionModel,
} from './collection-model.types.js'
import {
  COLLECTIONS_FILE,
  loadCollectionDeclaration,
} from './load-collection-declaration.js'

/** Where an addon publishes its collections, relative to its generated output. */
export const ADDON_COLLECTIONS_ARTIFACT =
  'collections/pikku-collection-meta.gen.json'

const MAX_ARTIFACT_BYTES = 1_000_000

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const readPackageJson = (dir: string): Record<string, any> =>
  JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))

/**
 * Check an addon's `db/collections.ts` against its own tables and publish it. A package
 * that declares collections and exports no `./collections` could not be used, so its
 * build fails here and not in the app that installs it.
 */
export const writeAddonCollection = async (
  rootDir: string,
  outDir: string
): Promise<string[]> => {
  const file = join(outDir, ADDON_COLLECTIONS_ARTIFACT)
  const declaration = await loadCollectionDeclaration(rootDir)
  if (!declaration) {
    if (existsSync(file)) rmSync(file)
    return []
  }
  const tables = await loadTableDeclaration(rootDir)
  const model = buildCollectionsModel({
    declaration,
    tables: tables?.schema.tables ?? {},
    buckets: [],
    addon: true,
  })
  if (!readPackageJson(rootDir).exports?.['./collections']) {
    throw new Error(
      `${COLLECTIONS_FILE} declares collections, and package.json exports no './collections'. Export the module that holds \`collectionHandlers\`:\n` +
        '  "exports": { "./collections": { "types": "./dist/src/collections.d.ts", "import": "./dist/src/collections.js" } }'
    )
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(declaration, null, 2)}\n`, 'utf8')
  return model.collections.map((collection) => collection.name)
}

const resolveArtifact = (
  rootDir: string,
  addon: AddonDeclaration
): string | undefined => {
  try {
    return createAddonResolver(
      addonResolutionDirs(rootDir, addon.file)
    ).resolve(`${addon.package}/.pikku/${ADDON_COLLECTIONS_ARTIFACT}`)
  } catch {
    return undefined
  }
}

const readCollections = (
  rootDir: string,
  addon: AddonDeclaration
): Record<string, unknown> | undefined => {
  const path = resolveArtifact(rootDir, addon)
  if (!path) return undefined
  if (statSync(path).size > MAX_ARTIFACT_BYTES) {
    throw new Error(
      `The '${addon.package}' addon publishes a ${ADDON_COLLECTIONS_ARTIFACT} larger than 1 MB, which is not read. Rebuild the addon.`
    )
  }
  const published: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (!isRecord(published)) {
    throw new Error(
      `The '${addon.package}' addon publishes a ${ADDON_COLLECTIONS_ARTIFACT} that is not an object of collections. Rebuild the addon.`
    )
  }
  return published
}

/**
 * What each wired addon of this project's database published. An addon that
 * cannot be read matters only when a collection asks for it by name.
 */
export const collectionAddonSources = (
  rootDir: string,
  addons: AddonDeclaration[],
  asked: ReadonlySet<string>
): CollectionAddonSource[] =>
  addons.flatMap((addon) => {
    if (addon.remote || !addon.name) return []
    try {
      const [found] = addonDeclarations(rootDir, [addon])
      return [
        {
          name: addon.name,
          package: addon.package,
          tables: found!.declaration.schema.tables,
          collections: readCollections(rootDir, addon),
        },
      ]
    } catch (error) {
      if (asked.has(addon.name)) throw error
      return []
    }
  })

/** The module a package's `./collections` export names. */
const handlersModule = (artifact: string, name: string): string | undefined => {
  let dir = dirname(artifact)
  while (dir !== parse(dir).root) {
    if (existsSync(join(dir, 'package.json'))) {
      const manifest = readPackageJson(dir)
      if (manifest.name === name) {
        const entry = manifest.exports?.['./collections']
        const target =
          typeof entry === 'string' ? entry : (entry?.import ?? entry?.default)
        return typeof target === 'string' ? join(dir, target) : undefined
      }
    }
    dir = dirname(dir)
  }
  return undefined
}

const neededHandlers = (collection: CollectionModel): string[] => [
  'list',
  'get',
  ...(collection.create ? ['create'] : []),
  ...(collection.edit ? ['update'] : []),
  ...(collection.delete ? ['delete'] : []),
  ...collection.actions.map((action) => `actions.${action.name}`),
]

/** Every opted-in addon collection has a handler for all the app switched on. */
export const verifyCollectionHandlers = async (
  rootDir: string,
  model: CollectionsModel,
  addons: AddonDeclaration[]
): Promise<void> => {
  const problems: string[] = []
  for (const collection of model.collections) {
    const { from } = collection
    if (!from) continue
    const addon = addons.find((a) => a.name === from.name)!
    const artifact = resolveArtifact(rootDir, addon)!
    const module = handlersModule(artifact, from.package)
    if (!module || !existsSync(module)) {
      problems.push(
        `${collection.name}: ${from.package} has no module behind its './collections' export${module ? ` (${module})` : ''}. Build the addon.`
      )
      continue
    }
    const exported = (await loadFreshUserModule(module))
      .collectionHandlers as any
    const handlers = exported?.[collection.name]
    const missing = neededHandlers(collection).filter((path) => {
      const [first, second] = path.split('.') as [string, string?]
      const found = second ? handlers?.[first]?.[second] : handlers?.[first]
      return typeof found !== 'function'
    })
    if (missing.length > 0) {
      problems.push(
        `${collection.name}: ${from.package}/collections has no handler for ${missing.join(', ')}`
      )
    }
  }
  if (problems.length > 0) {
    throw new Error(`${COLLECTIONS_FILE}: ${problems.join('; ')}.`)
  }
}
