import { parseVersionedId, formatVersionedId } from '@pikku/core'
import type { CLICommandMeta } from '@pikku/core/cli'
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

      updateWiringReferences(state, oldId, newId)
    } else {
      const latest = group.explicit.reduce((a, b) =>
        a.version > b.version ? a : b
      )
      state.rpc.internalMeta[baseName] = latest.id
    }

    if (state.rpc.exposedMeta[baseName]) {
      const latestId = state.rpc.internalMeta[baseName]!
      state.rpc.exposedMeta[baseName] = latestId
      for (const entry of group.explicit) {
        state.rpc.exposedMeta[entry.id] = entry.id
        const fileEntry = state.rpc.internalFiles.get(entry.id)
        if (fileEntry) {
          state.rpc.exposedFiles.set(entry.id, fileEntry)
        }
      }
      if (group.unversioned) {
        state.rpc.exposedMeta[latestId] = latestId
        const fileEntry = state.rpc.internalFiles.get(latestId)
        if (fileEntry) {
          state.rpc.exposedFiles.set(latestId, fileEntry)
        }
      }
    }

    for (const entry of group.explicit) {
      state.rpc.invokedFunctions.add(entry.id)
    }
  }
}

function updateWiringReferences(
  state: InspectorState,
  oldId: string,
  newId: string
): void {
  // HTTP routes
  if (state.http) {
    for (const methods of Object.values(state.http.meta)) {
      for (const meta of Object.values(methods)) {
        if (meta.pikkuFuncId === oldId) {
          meta.pikkuFuncId = newId
        }
      }
    }
  }

  // Channels: connect/disconnect/message slots + action-routed message wirings
  if (state.channels) {
    for (const channel of Object.values(state.channels.meta)) {
      for (const slot of [
        channel.connect,
        channel.disconnect,
        channel.message,
      ]) {
        if (slot && slot.pikkuFuncId === oldId) {
          slot.pikkuFuncId = newId
        }
      }
      for (const routes of Object.values(channel.messageWirings)) {
        for (const message of Object.values(routes)) {
          if (message.pikkuFuncId === oldId) {
            message.pikkuFuncId = newId
          }
        }
      }
    }
  }

  // CLI programs: commands and nested subcommands. This also covers
  // CLI-over-channel generation, which reads command funcIds from this meta.
  if (state.cli) {
    const updateCommands = (commands: Record<string, CLICommandMeta>): void => {
      for (const command of Object.values(commands)) {
        if (command.pikkuFuncId === oldId) {
          command.pikkuFuncId = newId
        }
        if (command.subcommands) {
          updateCommands(command.subcommands)
        }
      }
    }
    for (const program of Object.values(state.cli.meta.programs)) {
      updateCommands(program.commands)
    }
  }

  // Scheduled tasks
  if (state.scheduledTasks) {
    for (const task of Object.values(state.scheduledTasks.meta)) {
      if (task.pikkuFuncId === oldId) {
        task.pikkuFuncId = newId
      }
    }
  }

  // Queue workers
  if (state.queueWorkers) {
    for (const worker of Object.values(state.queueWorkers.meta)) {
      if (worker.pikkuFuncId === oldId) {
        worker.pikkuFuncId = newId
      }
    }
  }

  // Trigger sources (TriggerSourceMeta carries the handler's pikkuFuncId).
  // Gateways/workflows/agents reference functions by bare rpc name and are
  // resolved at runtime via state.rpc.internalMeta, so they need no rewrite here.
  if (state.triggers) {
    for (const source of Object.values(state.triggers.sourceMeta)) {
      if (source.pikkuFuncId === oldId) {
        source.pikkuFuncId = newId
      }
    }
  }

  // MCP resources, tools, and prompts
  if (state.mcpEndpoints) {
    for (const collection of [
      state.mcpEndpoints.resourcesMeta,
      state.mcpEndpoints.toolsMeta,
      state.mcpEndpoints.promptsMeta,
    ]) {
      for (const endpoint of Object.values(collection)) {
        if (endpoint.pikkuFuncId === oldId) {
          endpoint.pikkuFuncId = newId
        }
      }
    }
  }
}
