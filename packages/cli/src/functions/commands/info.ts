import { pikkuSessionlessFunc } from '#pikku'
import type { InspectorState } from '@pikku/inspector'
import type { FunctionMeta } from '@pikku/core'

const printTable = (
  headers: string[],
  rows: string[][],
  limit: number
): void => {
  const all = [headers, ...rows.slice(0, limit)]
  const widths = headers.map((_, col) =>
    Math.max(...all.map((row) => (row[col] ?? '').length))
  )
  const line = (row: string[]) =>
    row.map((cell, i) => cell.padEnd(widths[i])).join('  ')
  console.log(line(headers))
  console.log(widths.map((w) => '-'.repeat(w)).join('  '))
  for (const row of rows.slice(0, limit)) {
    console.log(line(row))
  }
  if (rows.length > limit) {
    console.log(
      `... and ${rows.length - limit} more (use --limit to show more)`
    )
  }
}

const getFunctionTypes = (funcId: string, state: InspectorState): string[] => {
  const types: string[] = []

  if (state.http?.meta) {
    for (const routes of Object.values(state.http.meta)) {
      for (const meta of Object.values(routes)) {
        if (meta.pikkuFuncId === funcId) types.push('http')
      }
    }
  }

  if (state.channels?.meta) {
    for (const channel of Object.values(state.channels.meta)) {
      const messages = [channel.connect, channel.disconnect, channel.message]
      for (const msg of messages) {
        if (msg && (msg as any).pikkuFuncId === funcId) types.push('channel')
      }
    }
  }

  if (state.scheduledTasks?.meta) {
    if (funcId in state.scheduledTasks.meta) types.push('scheduler')
  }

  if (state.queueWorkers?.meta) {
    if (funcId in state.queueWorkers.meta) types.push('queue')
  }

  if (state.workflows?.meta) {
    if (funcId in state.workflows.meta) types.push('workflow')
  }

  if (state.mcpEndpoints?.toolsMeta) {
    if (funcId in state.mcpEndpoints.toolsMeta) types.push('mcp')
  }

  if (state.cli?.meta) {
    for (const program of Object.values(state.cli.meta) as any[]) {
      if (program.commands) {
        for (const cmd of program.commands) {
          if (cmd.pikkuFuncId === funcId) types.push('cli')
        }
      }
    }
  }

  if (state.triggers?.meta) {
    if (funcId in state.triggers.meta) types.push('trigger')
  }

  return [...new Set(types)]
}

const getFilePath = (funcId: string, state: InspectorState): string => {
  const entry = state.functions.files.get(funcId)
  if (entry) {
    const relative = entry.path.replace(state.rootDir + '/', '')
    return relative
  }
  return ''
}

const formatMetadata = (
  meta: FunctionMeta['middleware'] | FunctionMeta['permissions']
): string => {
  if (!meta || meta.length === 0) return ''
  return meta
    .map((m) => {
      if ('name' in m) return (m as any).name
      if ('type' in m) return m.type
      return '?'
    })
    .join(', ')
}

type InfoInput = { limit?: string; verbose?: boolean }

export const pikkuInfoFunctions = pikkuSessionlessFunc<InfoInput, void>({
  func: async ({ getInspectorState }, data) => {
    const limit = parseInt(data?.limit ?? '50', 10)
    const verbose = !!data?.verbose
    const state = await getInspectorState()
    const meta = state.functions.meta

    const entries = Object.entries(meta)
    if (entries.length === 0) {
      console.log('No functions found.')
      return
    }

    if (!verbose) {
      const headers = ['pikkuFuncId', 'name', 'tags']
      const rows = entries.map(([id, m]) => [
        id,
        m.name ?? '',
        (m.tags ?? []).join(', '),
      ])
      printTable(headers, rows, limit)
    } else {
      const headers = [
        'pikkuFuncId',
        'name',
        'tags',
        'type',
        'middleware',
        'permissions',
        'file',
      ]
      const rows = entries.map(([id, m]) => [
        id,
        m.name ?? '',
        (m.tags ?? []).join(', '),
        getFunctionTypes(id, state).join(', '),
        formatMetadata(m.middleware),
        formatMetadata(m.permissions),
        getFilePath(id, state),
      ])
      printTable(headers, rows, limit)
    }
  },
})

export const pikkuInfoTags = pikkuSessionlessFunc<InfoInput, void>({
  func: async ({ getInspectorState }, data) => {
    const limit = parseInt(data?.limit ?? '50', 10)
    const verbose = !!data?.verbose
    const state = await getInspectorState()
    const meta = state.functions.meta

    const tagMap = new Map<
      string,
      {
        funcIds: string[]
        middlewareNames: string[]
        permissionNames: string[]
      }
    >()

    for (const [id, m] of Object.entries(meta)) {
      for (const tag of m.tags ?? []) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, {
            funcIds: [],
            middlewareNames: [],
            permissionNames: [],
          })
        }
        tagMap.get(tag)!.funcIds.push(m.name ?? id)
      }
    }

    const tagMiddleware = state.middleware?.tagMiddleware
    if (tagMiddleware) {
      for (const [tag, group] of tagMiddleware) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, {
            funcIds: [],
            middlewareNames: [],
            permissionNames: [],
          })
        }
        tagMap.get(tag)!.middlewareNames.push(...(group.instanceIds ?? []))
      }
    }

    const tagPermissions = state.permissions?.tagPermissions
    if (tagPermissions) {
      for (const [tag, group] of tagPermissions) {
        if (!tagMap.has(tag)) {
          tagMap.set(tag, {
            funcIds: [],
            middlewareNames: [],
            permissionNames: [],
          })
        }
        tagMap.get(tag)!.permissionNames.push(...(group.instanceIds ?? []))
      }
    }

    const tags = [...tagMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))

    if (tags.length === 0) {
      console.log('No tags found.')
      return
    }

    if (!verbose) {
      const headers = ['tag', 'functions', 'middleware', 'permissions']
      const rows = tags.map(([tag, info]) => [
        tag,
        String(info.funcIds.length),
        String(info.middlewareNames.length),
        String(info.permissionNames.length),
      ])
      printTable(headers, rows, limit)
    } else {
      const headers = ['tag', 'functions', 'middleware', 'permissions']
      const rows = tags.map(([tag, info]) => [
        tag,
        info.funcIds.join(', ') || '(none)',
        info.middlewareNames.join(', ') || '(none)',
        info.permissionNames.join(', ') || '(none)',
      ])
      printTable(headers, rows, limit)
    }
  },
})

export const pikkuInfoMiddleware = pikkuSessionlessFunc<InfoInput, void>({
  func: async ({ getInspectorState }, data) => {
    const limit = parseInt(data?.limit ?? '50', 10)
    const verbose = !!data?.verbose
    const state = await getInspectorState()
    const definitions = state.middleware?.definitions ?? {}

    const entries = Object.entries(definitions)
    if (entries.length === 0) {
      console.log('No middleware found.')
      return
    }

    if (!verbose) {
      const headers = ['id', 'name', 'exportedName']
      const rows = entries.map(([id, def]) => [
        id,
        def.name ?? '',
        def.exportedName ?? '',
      ])
      printTable(headers, rows, limit)
    } else {
      const headers = [
        'id',
        'name',
        'exportedName',
        'sourceFile',
        'services',
        'description',
      ]
      const rows = entries.map(([id, def]) => [
        id,
        def.name ?? '',
        def.exportedName ?? '',
        def.sourceFile?.replace(state.rootDir + '/', '') ?? '',
        def.services?.services?.join(', ') ?? '',
        def.description ?? '',
      ])
      printTable(headers, rows, limit)
    }
  },
})

export const pikkuInfoPermissions = pikkuSessionlessFunc<InfoInput, void>({
  func: async ({ getInspectorState }, data) => {
    const limit = parseInt(data?.limit ?? '50', 10)
    const verbose = !!data?.verbose
    const state = await getInspectorState()
    const definitions = state.permissions?.definitions ?? {}

    const entries = Object.entries(definitions)
    if (entries.length === 0) {
      console.log('No permissions found.')
      return
    }

    if (!verbose) {
      const headers = ['id', 'name', 'exportedName']
      const rows = entries.map(([id, def]) => [
        id,
        def.name ?? '',
        def.exportedName ?? '',
      ])
      printTable(headers, rows, limit)
    } else {
      const headers = [
        'id',
        'name',
        'exportedName',
        'sourceFile',
        'services',
        'description',
      ]
      const rows = entries.map(([id, def]) => [
        id,
        def.name ?? '',
        def.exportedName ?? '',
        def.sourceFile?.replace(state.rootDir + '/', '') ?? '',
        def.services?.services?.join(', ') ?? '',
        def.description ?? '',
      ])
      printTable(headers, rows, limit)
    }
  },
})
