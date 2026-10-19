import { pikkuSessionlessFunc } from '#pikku/function'
import { writeFileInDir } from '../../../utils/file-writer.js'
import { logCommandInfoAndTime } from '../../../middleware/log-command-info-and-time.js'
import { getFileImportRelativePath } from '../../../utils/file-import-path.js'
import { withoutScenarios } from '../scenarios/scenario-partition.js'
import { sdkDefaultVersions } from '../../../utils/addon-sdk.js'
import type { InspectorState } from '@pikku/inspector'

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

/**
 * For each versioned remote addon, by package: the id a call without `@vN` is
 * sent to — the newest version in the SDK this project built against, so a
 * host that has moved on to `fn@v3` still gets `fn@v2` from a v2 consumer.
 */
export function remoteAddonDefaultVersions(
  state: Pick<InspectorState, 'remoteAddonFunctions'> & {
    rpc: Pick<InspectorState['rpc'], 'wireAddonDeclarations'>
  }
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const [namespace, decl] of state.rpc.wireAddonDeclarations) {
    const functions = state.remoteAddonFunctions?.[namespace]
    if (!decl.remote || !functions) continue
    const defaults = sdkDefaultVersions(functions)
    if (Object.keys(defaults).length > 0) out[decl.package] = defaults
  }
  return out
}

const serializeRemoteDefaults = (
  defaults: Record<string, Record<string, string>>
): string =>
  Object.entries(defaults)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([pkg, meta]) =>
        `pikkuState(${JSON.stringify(pkg)}, 'rpc', 'meta', ${JSON.stringify(meta, null, 2)})`
    )
    .join('\n')

export const pikkuRPC = pikkuSessionlessFunc<void, boolean>({
  func: async ({ logger, config, getInspectorState }) => {
    const state = await getInspectorState()
    const { rpc, functions } = state
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

    // A remote addon's calls go out with the version its SDK names; the host
    // never picks one for them.
    const remoteDefaults = remoteAddonDefaultVersions(state)
    const lines = ["import { pikkuState } from '@pikku/core/state'"]

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

      lines.push(
        importStatement,
        `pikkuState(${packageNameArg}, 'rpc', 'meta', metaData as Record<string, string>)`
      )
    }
    if (Object.keys(remoteDefaults).length > 0) {
      lines.push(serializeRemoteDefaults(remoteDefaults))
    }
    if (lines.length === 1) return false

    await writeFileInDir(logger, rpcInternalWiringMetaFile, lines.join('\n'))
    return true
  },
  middleware: [
    logCommandInfoAndTime({
      commandStart: 'Finding RPCs tasks',
      commandEnd: 'Found RPCs',
    }),
  ],
})
