import type { InspectorState } from '@pikku/inspector'
import type { PikkuCLIConfig } from '../../types/config.js'
import { getFileImportRelativePath } from '../utils/file-import-path.js'
import {
  collectServiceSources,
  providedKeys,
} from './resolve-pikku-services.js'
import { serializeSingletonServicesType } from './serialize-singleton-services-type.js'

type Config = Pick<
  PikkuCLIConfig,
  'pikkuServiceTypesFile' | 'packageMappings' | 'rootDir'
>

/**
 * The source of `#pikku/service` for the services the inspector has found so
 * far. Run again after each inspection until the source stops changing: what a
 * service provides is read from its return type, which can depend on this very
 * file, so one pass over a stale tree is not the answer.
 */
export const serviceTypesSource = (
  state: Pick<
    InspectorState,
    'pikkuServices' | 'optedInServices' | 'filesAndMethods'
  > & { rpc: Pick<InspectorState['rpc'], 'wireAddonDeclarations'> },
  config: Config
): string => {
  const base = state.filesAndMethods.singletonServicesType
  if (!base) {
    throw new Error('Required types not found: singletonServicesType')
  }
  const leaf = config.pikkuServiceTypesFile
  const mappings = config.packageMappings
  return serializeSingletonServicesType({
    baseImport: `import type { ${base.type} as BaseSingletonServices } from '${getFileImportRelativePath(leaf, base.typePath, mappings)}'`,
    services: collectServiceSources(state, config.rootDir).map((source) => ({
      name: source.name,
      provides: providedKeys(source.meta),
      specifier: getFileImportRelativePath(leaf, source.module, mappings),
      export: source.export,
    })),
  })
}

/**
 * The `SingletonServices` a generated file imports: the merged type from the
 * service leaf for an application, the project's own for an addon (which has no
 * services to merge).
 */
export const singletonServicesTypeRef = (
  state: Pick<InspectorState, 'filesAndMethods'>,
  config: Config & { addon?: unknown },
  fromFile: string
): { import: string; name: string } => {
  const base = state.filesAndMethods.singletonServicesType
  if (!base) {
    throw new Error('Required types not found: singletonServicesType')
  }
  const own = !config.addon
  const name = own ? 'SingletonServices' : base.type
  const path = own ? config.pikkuServiceTypesFile : base.typePath
  return {
    name,
    import: `import type { ${name} } from '${getFileImportRelativePath(fromFile, path, config.packageMappings)}'`,
  }
}

/** Every key any service the project runs provides, so the services map names them. */
export const providedServiceKeys = (
  state: Parameters<typeof collectServiceSources>[0],
  rootDir: string
): string[] => [
  ...new Set(
    collectServiceSources(state, rootDir).flatMap((source) =>
      providedKeys(source.meta)
    )
  ),
]
