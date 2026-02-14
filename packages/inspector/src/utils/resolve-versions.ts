import { parseVersionedId, formatVersionedId } from '@pikku/core'
import type { InspectorState, InspectorLogger } from '../types.js'
import { ErrorCode } from '../error-codes.js'

export function resolveLatestVersions(
  state: InspectorState,
  logger: InspectorLogger
): void {
  const functionsMeta = state.functions.meta

  const groups = new Map<
    string,
    {
      explicit: { id: string; version: number }[]
      unversioned: string | null
    }
  >()

  for (const [id, meta] of Object.entries(functionsMeta)) {
    const parsed = parseVersionedId(id)
    const baseName = parsed.version !== null ? parsed.baseName : id
    let group = groups.get(baseName)
    if (!group) {
      group = { explicit: [], unversioned: null }
      groups.set(baseName, group)
    }
    if (parsed.version !== null) {
      group.explicit.push({ id, version: parsed.version })
    } else if (meta.version !== undefined) {
      group.explicit.push({ id, version: meta.version })
    } else {
      group.unversioned = id
    }
  }

  for (const [baseName, group] of groups) {
    if (group.explicit.length === 0) {
      continue
    }

    const seen = new Map<number, string>()
    for (const entry of group.explicit) {
      const existing = seen.get(entry.version)
      if (existing) {
        logger.critical(
          ErrorCode.DUPLICATE_FUNCTION_VERSION,
          `Duplicate version ${entry.version} for function '${baseName}': '${existing}' and '${entry.id}'.`
        )
      }
      seen.set(entry.version, entry.id)
    }

    const maxVersion = Math.max(...group.explicit.map((e) => e.version))

    if (group.unversioned) {
      const implicitVersion = maxVersion + 1
      const oldId = group.unversioned
      const newId = formatVersionedId(baseName, implicitVersion)

      const meta = functionsMeta[oldId]!
      meta.pikkuFuncId = newId
      meta.version = implicitVersion
      delete functionsMeta[oldId]
      functionsMeta[newId] = meta

      const fileEntry = state.functions.files.get(oldId)
      if (fileEntry) {
        state.functions.files.delete(oldId)
        state.functions.files.set(newId, fileEntry)
      }

      const rpcFileEntry = state.rpc.internalFiles.get(oldId)
      if (rpcFileEntry) {
        state.rpc.internalFiles.delete(oldId)
        state.rpc.internalFiles.set(newId, rpcFileEntry)
      }

      if (state.rpc.invokedFunctions.has(oldId)) {
        state.rpc.invokedFunctions.delete(oldId)
        state.rpc.invokedFunctions.add(newId)
      }

      if (state.serviceAggregation.usedFunctions.has(oldId)) {
        state.serviceAggregation.usedFunctions.delete(oldId)
        state.serviceAggregation.usedFunctions.add(newId)
      }

      state.rpc.internalMeta[baseName] = newId
      state.rpc.internalMeta[newId] = newId

      if (state.rpc.exposedMeta[baseName] === oldId) {
        state.rpc.exposedMeta[baseName] = newId
      }
    } else {
      const latest = group.explicit.reduce((a, b) =>
        a.version > b.version ? a : b
      )
      state.rpc.internalMeta[baseName] = latest.id
    }

    for (const entry of group.explicit) {
      state.rpc.invokedFunctions.add(entry.id)
    }
  }
}
