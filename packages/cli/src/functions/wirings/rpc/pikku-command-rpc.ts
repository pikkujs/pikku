import { pikkuSessionlessFunc } from '#pikku'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { withoutScenarios } from '../scenarios/scenario-partition.js'

export function filterInternalRPCMeta(
  internalMeta: Record<string, string>,
  functionsMeta: Record<string, unknown>
): Record<string, string> {
  const filteredInternalMeta: Record<string, string> = {}
  for (const [key, value] of Object.entries(internalMeta)) {
    if (key in functionsMeta || value in functionsMeta) {
      filteredInternalMeta[key] = value
    }
  }
  return filteredInternalMeta
}

export const pikkuRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const { rpc, functions } = await getInspectorState()
    const {
      rpcInternalWiringMetaFile,
      rpcInternalWiringMetaJsonFile,
      packageMappings,
      schema,
    } = config

    // Keep direct function ids and unversioned aliases whose target function
    // survived filtering. Without the second check, aliases like `listCards`
    // get dropped even though `listCards@v2` still exists.
    // Scenarios are excluded along with the steps they call: a scenario name in
    // the app's RPC meta is a name a deployed bundle carries and, in principle,
    // dispatches. Scenario runs don't need the entry — the mapping is the
    // identity, which is also the fallback when a name is absent.
    const filteredInternalMeta = filterInternalRPCMeta(
      rpc.internalMeta,
      withoutScenarios(functions.meta)
    )

    if (Object.keys(filteredInternalMeta).length > 0) {
      await writeFileInDir(
        logger,
        rpcInternalWiringMetaJsonFile,
        JSON.stringify(filteredInternalMeta, null, 2)
      )

      const jsonImportPath = getFileImportRelativePath(
        rpcInternalWiringMetaFile,
        rpcInternalWiringMetaJsonFile,
        packageMappings
      )

      const supportsImportAttributes = schema?.supportsImportAttributes ?? false
      const importStatement = supportsImportAttributes
        ? `import metaData from '${jsonImportPath}' with { type: 'json' }`
        : `import metaData from '${jsonImportPath}'`

      const packageNameArg = config.addonName ? `'${config.addonName}'` : 'null'

      await writeFileInDir(
        logger,
        rpcInternalWiringMetaFile,
        `import { pikkuState } from '@pikku/core/ecosystem'\n${importStatement}\npikkuState(${packageNameArg}, 'rpc', 'meta', metaData as Record<string, string>)`
      )
      return true
    }
    return false
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding RPCs tasks',
      commandEnd: 'Found RPCs',
    }),
  ],
})
