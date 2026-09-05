import type { CLILogger } from '../services/cli-logger.service.js'
import { writeFileInDir } from './file-writer.js'
import { getFileImportRelativePath } from './file-import-path.js'
import { stripVerboseFields, hasVerboseFields } from './strip-verbose-meta.js'

export interface WriteMetaSidecarOptions {
  logger: CLILogger
  /** The full meta, verbose fields and all. */
  meta: unknown
  metaJsonFile: string
  /**
   * The copy to write to `metaJsonFile`, when a wiring needs more than
   * `stripVerboseFields` gives it — the functions wiring reattaches services
   * an addon consumer cannot resolve without them.
   */
  minimalMeta?: unknown
  ignoreModifyComment?: boolean
}

export interface WriteWiringMetaOptions extends WriteMetaSidecarOptions {
  metaFile: string
  packageMappings: Record<string, string>
  supportsImportAttributes: boolean
  serializeMetaTS: (imports: {
    jsonImportPath: string
    importStatement: string
  }) => string
}

const verboseSiblingOf = (metaJsonFile: string) =>
  metaJsonFile.endsWith('.gen.json')
    ? metaJsonFile.replace(/\.gen\.json$/, '-verbose.gen.json')
    : metaJsonFile.replace(/(\.\w+)$/, '-verbose$1')

/**
 * Writes a wiring's metadata sidecar: the minimal JSON every runtime reads,
 * and a `-verbose` sibling only when there is something extra to say.
 *
 * The split exists because the minimal copy is imported by generated code and
 * ships to every consumer, while descriptions, tags and step names are read off
 * disk by whatever documents the wiring — the console needs them, a running
 * server never does.
 */
export const writeMetaSidecar = async ({
  logger,
  meta,
  metaJsonFile,
  minimalMeta,
  ignoreModifyComment,
}: WriteMetaSidecarOptions) => {
  const writeOptions = ignoreModifyComment ? { ignoreModifyComment } : undefined

  await writeFileInDir(
    logger,
    metaJsonFile,
    JSON.stringify(minimalMeta ?? stripVerboseFields(meta), null, 2),
    writeOptions
  )

  if (!hasVerboseFields(meta)) {
    return
  }

  const verbosePath = verboseSiblingOf(metaJsonFile)
  if (verbosePath === metaJsonFile) {
    logger.warn(
      `Cannot derive verbose path from ${metaJsonFile}, skipping verbose metadata`
    )
    return
  }

  await writeFileInDir(
    logger,
    verbosePath,
    JSON.stringify(meta, null, 2),
    writeOptions
  )
}

/**
 * Writes a wiring's metadata sidecar and the TypeScript module that imports it.
 *
 * The module is what makes the sidecar ship: tsc only copies a .json into dist
 * when something imports it, and an addon publishes only its compiled output —
 * inlining the meta instead would leave a consumer with nothing to merge.
 * `supportsImportAttributes` is the caller's runtime, not this one's: a target
 * that predates import attributes rejects the `with { type: 'json' }` form.
 */
export const writeWiringMeta = async ({
  metaFile,
  packageMappings,
  supportsImportAttributes,
  serializeMetaTS,
  ...sidecar
}: WriteWiringMetaOptions) => {
  await writeMetaSidecar(sidecar)

  const jsonImportPath = getFileImportRelativePath(
    metaFile,
    sidecar.metaJsonFile,
    packageMappings
  )

  const importStatement = supportsImportAttributes
    ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
    : `import metaData from '${jsonImportPath}'`

  await writeFileInDir(
    sidecar.logger,
    metaFile,
    serializeMetaTS({ jsonImportPath, importStatement })
  )
}
