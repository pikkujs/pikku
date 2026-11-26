import type { InspectorState } from '@pikku/inspector'
import type { PikkuCLIConfig } from '../../types/config.js'
import { getFileImportRelativePath } from './file-import-path.js'

/** The project's `SingletonServices`, as a generated file imports it. */
export const singletonServicesTypeRef = (
  state: Pick<InspectorState, 'filesAndMethods'>,
  config: Pick<PikkuCLIConfig, 'packageMappings'>,
  fromFile: string
): { import: string; name: string } => {
  const base = state.filesAndMethods.singletonServicesType
  if (!base) {
    throw new Error('Required types not found: singletonServicesType')
  }
  return {
    name: base.type,
    import: `import type { ${base.type} } from '${getFileImportRelativePath(fromFile, base.typePath, config.packageMappings)}'`,
  }
}
