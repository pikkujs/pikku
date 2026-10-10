import { pikkuState } from '../pikku-state.js'
import type {
  MCPPromptMeta,
  MCPResourceMeta,
  MCPToolMeta,
} from '../wirings/mcp/mcp.types.js'
import { ensureFunction } from './registered-function.js'
import type { MountHandle } from './types.js'

export type MCPWiring = {
  func?: unknown
  middleware?: unknown[]
  tags?: string[]
  [key: string]: unknown
}

export type MCPMount = {
  packageName?: string
  tools?: Record<string, { meta: MCPToolMeta[string]; wiring?: MCPWiring }>
  resources?: Record<
    string,
    { meta: MCPResourceMeta[string]; wiring?: MCPWiring }
  >
  prompts?: Record<string, { meta: MCPPromptMeta[string]; wiring?: MCPWiring }>
}

type Table = Record<string, { pikkuFuncId: string; packageName?: string }>

export const mountMCP = ({
  packageName,
  tools = {},
  resources = {},
  prompts = {},
}: MCPMount): MountHandle => {
  const toolsMeta = pikkuState(null, 'mcp', 'toolsMeta') as Table
  const resourcesMeta = pikkuState(null, 'mcp', 'resourcesMeta') as Table
  const promptsMeta = pikkuState(null, 'mcp', 'promptsMeta') as Table
  const resourceWirings = pikkuState(null, 'mcp', 'resources')
  const promptWirings = pikkuState(null, 'mcp', 'prompts')

  const requested: Array<[string, Table, string]> = [
    ...Object.keys(tools).map((n): [string, Table, string] => [
      'tool',
      toolsMeta,
      n,
    ]),
    ...Object.keys(resources).map((n): [string, Table, string] => [
      'resource',
      resourcesMeta,
      n,
    ]),
    ...Object.keys(prompts).map((n): [string, Table, string] => [
      'prompt',
      promptsMeta,
      n,
    ]),
  ]
  for (const [kind, table, name] of requested) {
    if (table[name]) {
      throw new Error(`MCP ${kind} "${name}" is already defined`)
    }
  }

  const functionRestores: Array<() => void> = []
  const undo: Array<() => void> = []
  const added: string[] = []
  const restoreAll = () => {
    for (const fn of undo.splice(0).reverse()) fn()
    for (const fn of functionRestores.splice(0).reverse()) fn()
  }

  const add = (
    kind: 'tool' | 'resource' | 'prompt',
    table: Table,
    name: string,
    meta: Table[string],
    wiring: MCPWiring | undefined,
    wirings?: Map<string, any>
  ) => {
    if (!wirings && (wiring?.middleware?.length || wiring?.tags?.length)) {
      throw new Error(
        `MCP ${kind} "${name}" cannot take wiring middleware or tags; put them in meta.middleware`
      )
    }
    const stamped = { ...meta, packageName: packageName ?? meta.packageName }
    functionRestores.push(
      ensureFunction(
        `MCP ${kind}`,
        name,
        meta.pikkuFuncId,
        stamped.packageName ?? null,
        wiring?.func
      )
    )
    table[name] = stamped
    let entry: unknown
    if (wirings) {
      const { func: _func, ...rest } = wiring ?? {}
      entry = {
        ...rest,
        ...(kind === 'resource' ? { uri: name } : { name }),
      }
      wirings.set(name, entry)
    }
    undo.push(() => {
      if (table[name] === stamped) delete table[name]
      if (wirings && wirings.get(name) === entry) wirings.delete(name)
    })
    added.push(`${kind}:${name}`)
  }

  try {
    for (const [name, { meta, wiring }] of Object.entries(tools)) {
      add('tool', toolsMeta, name, meta, wiring)
    }
    for (const [uri, { meta, wiring }] of Object.entries(resources)) {
      add('resource', resourcesMeta, uri, meta, wiring, resourceWirings)
    }
    for (const [name, { meta, wiring }] of Object.entries(prompts)) {
      add('prompt', promptsMeta, name, meta, wiring, promptWirings)
    }
  } catch (error) {
    restoreAll()
    throw error
  }

  const labels = [...added]
  let unmounted = false
  return {
    added: labels,
    unmount: () => {
      if (unmounted) return labels
      unmounted = true
      restoreAll()
      return labels
    },
  }
}
