import { pikkuSessionlessFunc } from '#pikku'
import type { InspectorState } from '@pikku/inspector'

function out(value: unknown): void {
  console.log(JSON.stringify(value))
}

// `getInspectorState` already returns `Promise<InspectorState>` per
// packages/cli/types/application-types.d.ts, but TS infers a wider shape
// inside generated code. Use this helper everywhere in this file so each
// call site sees the typed state and field-typo regressions surface
// immediately when the inspector schema shifts.
type InspectorStateGetter = () => Promise<InspectorState>
const typedState = (
  getInspectorState: InspectorStateGetter
): Promise<InspectorState> => getInspectorState()

export const pikkuMetaFunctionsList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const meta = state.functions.meta ?? {}
    const functions = Object.entries(meta).map(([id, m]) => ({
      id,
      name: m.name ?? id,
      description: m.description ?? null,
      tags: m.tags ?? [],
    }))
    out({ functions })
  },
})

export const pikkuMetaFunctionsGet = pikkuSessionlessFunc<
  { functionId: string },
  void
>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const m = state.functions.meta?.[data.functionId]
    if (!m) throw new Error(`Function not found: ${data.functionId}`)
    out({
      functionId: data.functionId,
      name: m.name ?? data.functionId,
      description: m.description ?? null,
      sourceFile: m.sourceFile ?? null,
      inputSchemaName: m.inputSchemaName ?? null,
      outputSchemaName: m.outputSchemaName ?? null,
      tags: m.tags ?? [],
      expose: m.expose === true,
      readonly: m.readonly === true,
      input: { name: m.inputSchemaName ?? null, jsonSchema: null },
      output: { name: m.outputSchemaName ?? null, jsonSchema: null },
    })
  },
})

export const pikkuMetaWorkflowsList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const meta = state.workflows?.meta ?? {}
    const workflows = Object.entries(meta).map(([id, wf]: [string, any]) => ({
      id,
      name: wf.name ?? id,
      description: wf.description ?? null,
    }))
    out({ workflows })
  },
})

export const pikkuMetaWorkflowsGet = pikkuSessionlessFunc<
  { workflowId: string },
  void
>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const wf = (state.workflows?.meta ?? {})[data.workflowId] as any
    if (!wf) throw new Error(`Workflow not found: ${data.workflowId}`)
    out({
      workflowId: data.workflowId,
      name: wf.name ?? data.workflowId,
      description: wf.description ?? null,
      steps: wf.steps ?? [],
      mode: wf.inline ? 'inline' : 'distributed',
    })
  },
})

export const pikkuMetaMiddlewareList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const defs = state.middleware?.definitions ?? {}
    const middleware = Object.entries(defs).map(([id, d]: [string, any]) => ({
      id,
      name: d.name ?? id,
      description: d.description ?? null,
    }))
    out({ middleware })
  },
})

export const pikkuMetaMiddlewareGet = pikkuSessionlessFunc<
  { middlewareId: string },
  void
>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const d = (state.middleware?.definitions ?? {})[data.middlewareId] as any
    if (!d) throw new Error(`Middleware not found: ${data.middlewareId}`)
    out({
      middlewareId: data.middlewareId,
      name: d.name ?? data.middlewareId,
      description: d.description ?? null,
      scope: ['function', 'workflow', 'agent'],
      configSchema: null,
    })
  },
})

export const pikkuMetaPermissionsList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const defs = state.permissions?.definitions ?? {}
    const permissions = Object.entries(defs).map(([id, d]: [string, any]) => ({
      id,
      name: d.name ?? id,
      description: d.description ?? null,
    }))
    out({ permissions })
  },
})

export const pikkuMetaPermissionsGet = pikkuSessionlessFunc<
  { permissionId: string },
  void
>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const d = (state.permissions?.definitions ?? {})[data.permissionId] as any
    if (!d) throw new Error(`Permission not found: ${data.permissionId}`)
    out({
      permissionId: data.permissionId,
      name: d.name ?? data.permissionId,
      description: d.description ?? null,
      scope: ['function', 'workflow', 'agent'],
      configSchema: null,
    })
  },
})

export const pikkuMetaWiresList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const wireTypes = [
      {
        type: 'http',
        count: Object.keys(state.http?.meta ?? {}).reduce(
          (n, k) => n + Object.keys((state.http?.meta as any)[k] ?? {}).length,
          0
        ),
      },
      {
        type: 'scheduler',
        count: Object.keys(state.scheduledTasks?.meta ?? {}).length,
      },
      {
        type: 'queue',
        count: Object.keys(state.queueWorkers?.meta ?? {}).length,
      },
      {
        type: 'channel',
        count: Object.keys(state.channels?.meta ?? {}).length,
      },
      {
        type: 'trigger',
        count: Object.keys(state.triggers?.meta ?? {}).length,
      },
    ]
    out({ wireTypes })
  },
})

async function wiresByType(
  getInspectorState: InspectorStateGetter,
  type: string
): Promise<Array<Record<string, unknown>>> {
  const state = await typedState(getInspectorState)
  let items: Array<Record<string, unknown>> = []

  if (type === 'http') {
    const meta = state.http?.meta ?? {}
    for (const [route, methods] of Object.entries(meta)) {
      for (const [method, m] of Object.entries(methods ?? {})) {
        items.push({
          id: `${method}:${route}`,
          functionId: m.pikkuFuncId,
          route,
          method,
        })
      }
    }
  } else if (type === 'scheduler') {
    items = Object.entries(state.scheduledTasks?.meta ?? {}).map(
      ([functionId, m]) => ({
        id: m?.name ?? functionId,
        functionId,
        cron: m?.schedule ?? null,
      })
    )
  } else if (type === 'queue') {
    // QueueWorkersMeta is keyed by queue name; the value's `name` mirrors
    // the key. There's no separate `queueName` field — the prior
    // `m?.queueName` was always undefined.
    items = Object.entries(state.queueWorkers?.meta ?? {}).map(
      ([queueName, m]) => ({
        id: queueName,
        functionId: queueName,
        queueName: m?.name ?? queueName,
      })
    )
  } else if (type === 'channel') {
    items = Object.entries(state.channels?.meta ?? {}).map(
      ([channelName, m]) => ({
        id: channelName,
        functionId:
          m?.message?.pikkuFuncId ??
          m?.connect?.pikkuFuncId ??
          m?.disconnect?.pikkuFuncId ??
          null,
        channelName,
      })
    )
  } else if (type === 'trigger') {
    // TriggerMeta only carries `name`. There's no `type` field here —
    // the prior `m?.type` was always undefined.
    items = Object.entries(state.triggers?.meta ?? {}).map(
      ([triggerKey, m]) => ({
        id: m?.name ?? triggerKey,
        functionId: triggerKey,
      })
    )
  } else {
    throw new Error(`Unsupported wire type: ${type}`)
  }
  return items
}

export const pikkuMetaWiresType = pikkuSessionlessFunc<{ type: string }, void>({
  func: async ({ getInspectorState }, data) => {
    const items = await wiresByType(getInspectorState, data.type)
    out({ type: data.type, items })
  },
})

export const pikkuMetaWiresHttp = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'http',
      items: await wiresByType(getInspectorState, 'http'),
    })
  },
})

export const pikkuMetaWiresScheduler = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'scheduler',
      items: await wiresByType(getInspectorState, 'scheduler'),
    })
  },
})

export const pikkuMetaWiresQueue = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'queue',
      items: await wiresByType(getInspectorState, 'queue'),
    })
  },
})

export const pikkuMetaWiresChannel = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'channel',
      items: await wiresByType(getInspectorState, 'channel'),
    })
  },
})

export const pikkuMetaWiresTrigger = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'trigger',
      items: await wiresByType(getInspectorState, 'trigger'),
    })
  },
})

/**
 * Bulk context endpoint.
 *
 * Single inspection → returns everything a planner needs for first-pass
 * planning: functions, all wires, middleware, permissions, workflows, plus
 * project capabilities (which wire types are in use) and layout (where new
 * files should land). Designed to replace the 6+ list calls in the planner
 * spec — one process spawn, one inspect, ~all the metadata.
 *
 * Targeted `pikku meta * get` calls are still the right tool when the planner
 * wants schema details (input/output JSON schemas) for a specific entry.
 */
export const pikkuMetaContext = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState, config }) => {
    const state = await getInspectorState()

    const functions = Object.entries(state.functions.meta ?? {}).map(
      ([id, m]: [string, any]) => ({
        id,
        name: m?.name ?? id,
        description: m?.description ?? null,
        tags: m?.tags ?? [],
        sourceFile: m?.sourceFile ?? null,
        inputSchemaName: m?.inputSchemaName ?? null,
        outputSchemaName: m?.outputSchemaName ?? null,
        expose: m?.expose === true,
        readonly: m?.readonly === true,
      })
    )

    const middleware = Object.entries(state.middleware?.definitions ?? {}).map(
      ([id, d]: [string, any]) => ({
        id,
        name: d?.name ?? id,
        description: d?.description ?? null,
      })
    )

    const permissions = Object.entries(
      state.permissions?.definitions ?? {}
    ).map(([id, d]: [string, any]) => ({
      id,
      name: d?.name ?? id,
      description: d?.description ?? null,
    }))

    const workflows = Object.entries(state.workflows?.meta ?? {}).map(
      ([id, wf]: [string, any]) => ({
        id,
        name: wf?.name ?? id,
        description: wf?.description ?? null,
        mode: wf?.inline ? 'inline' : 'distributed',
      })
    )

    const wires = {
      http: await wiresByType(getInspectorState, 'http'),
      scheduler: await wiresByType(getInspectorState, 'scheduler'),
      queue: await wiresByType(getInspectorState, 'queue'),
      channel: await wiresByType(getInspectorState, 'channel'),
      trigger: await wiresByType(getInspectorState, 'trigger'),
    }

    const capabilities = {
      http: wires.http.length > 0,
      scheduler: wires.scheduler.length > 0,
      queue: wires.queue.length > 0,
      channel: wires.channel.length > 0,
      trigger: wires.trigger.length > 0,
      workflow: workflows.length > 0,
      // Note the real paths: `mcpEndpoints` (not `mcp`) and
      // `agents.agentsMeta` (not `agents.meta`). The earlier `as any`
      // versions were silently always 0.
      mcp:
        Object.keys(state.mcpEndpoints?.toolsMeta ?? {}).length +
          Object.keys(state.mcpEndpoints?.resourcesMeta ?? {}).length +
          Object.keys(state.mcpEndpoints?.promptsMeta ?? {}).length >
        0,
      agent: Object.keys(state.agents?.agentsMeta ?? {}).length > 0,
    }

    const cfg = config as any
    const srcDirectories: string[] = cfg.srcDirectories ?? []
    // If the project doesn't declare scaffold dirs, fall back to standard
    // conventions rooted at the first src directory. Agents need a concrete
    // target dir to emit `targetFile` against — null is not actionable.
    const srcRoot = srcDirectories[0] ?? 'src'
    const layout = {
      rootDir: cfg.rootDir ?? null,
      srcDirectories,
      configFile: cfg.configFile ?? null,
      scaffold: {
        functionDir: cfg.scaffold?.functionDir ?? `${srcRoot}/functions`,
        wiringDir: cfg.scaffold?.wiringDir ?? `${srcRoot}/wirings`,
        middlewareDir: cfg.scaffold?.middlewareDir ?? `${srcRoot}/middleware`,
        permissionDir: cfg.scaffold?.permissionDir ?? `${srcRoot}/permissions`,
      },
      globalHTTPPrefix: cfg.globalHTTPPrefix || null,
    }

    const summary = {
      functions: functions.length,
      middleware: middleware.length,
      permissions: permissions.length,
      workflows: workflows.length,
      wires: {
        http: wires.http.length,
        scheduler: wires.scheduler.length,
        queue: wires.queue.length,
        channel: wires.channel.length,
        trigger: wires.trigger.length,
      },
    }

    out({
      schemaVersion: 'meta-context.v1',
      summary,
      capabilities,
      layout,
      functions,
      middleware,
      permissions,
      workflows,
      wires,
    })
  },
})

/**
 * Frontend-targeted metadata.
 *
 * Returns only what a UI agent needs to write client code:
 *   - RPCs: every exposed function with input/output type names,
 *     description, readonly flag, tags.
 *   - Workflows: name, description, mode (inline|distributed), input/output
 *     types resolved through the workflow's underlying function.
 *   - Channels: name, route, description, plus the input/output types of
 *     the connect / disconnect / message handlers and any routed messages.
 *
 * Everything else (middleware, permissions, layout, scaffold dirs,
 * non-exposed functions, http wires) is a backend concern and stays in
 * `pikku meta context`.
 */
export const pikkuMetaClients = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const functionsMeta = (state.functions.meta ?? {}) as Record<string, any>

    const lookupIO = (
      pikkuFuncId: string | null | undefined
    ): {
      input: string | null
      output: string | null
      description: string | null
    } => {
      if (!pikkuFuncId) return { input: null, output: null, description: null }
      const m = functionsMeta[pikkuFuncId]
      return {
        input: m?.inputSchemaName ?? null,
        output: m?.outputSchemaName ?? null,
        description: m?.description ?? null,
      }
    }

    const rpcs = Object.entries(functionsMeta)
      .filter(([_id, m]: [string, any]) => m?.expose === true)
      .map(([id, m]: [string, any]) => ({
        name: id,
        description: m?.description ?? null,
        readonly: m?.readonly === true,
        tags: m?.tags ?? [],
        input: m?.inputSchemaName ?? null,
        output: m?.outputSchemaName ?? null,
      }))

    const workflows = Object.entries(state.workflows?.meta ?? {}).map(
      ([id, wf]: [string, any]) => {
        const io = lookupIO(wf?.pikkuFuncId ?? id)
        return {
          name: id,
          description: wf?.description ?? io.description,
          mode: wf?.inline ? 'inline' : 'distributed',
          input: io.input,
          output: io.output,
        }
      }
    )

    const channels = Object.entries(state.channels?.meta ?? {}).map(
      ([name, ch]: [string, any]) => {
        const messageWirings: Record<
          string,
          Record<
            string,
            {
              input: string | null
              output: string | null
              description: string | null
            }
          >
        > = {}
        for (const [route, methods] of Object.entries(
          ch?.messageWirings ?? {}
        ) as Array<[string, any]>) {
          messageWirings[route] = {}
          for (const [method, handler] of Object.entries(
            methods ?? {}
          ) as Array<[string, any]>) {
            messageWirings[route][method] = lookupIO(handler?.pikkuFuncId)
          }
        }
        return {
          name,
          route: ch?.route ?? null,
          description: ch?.description ?? null,
          connect: ch?.connect?.pikkuFuncId
            ? lookupIO(ch.connect.pikkuFuncId)
            : null,
          disconnect: ch?.disconnect?.pikkuFuncId
            ? lookupIO(ch.disconnect.pikkuFuncId)
            : null,
          message: ch?.message?.pikkuFuncId
            ? lookupIO(ch.message.pikkuFuncId)
            : null,
          messageWirings:
            Object.keys(messageWirings).length > 0 ? messageWirings : null,
        }
      }
    )

    out({
      schemaVersion: 'meta-clients.v1',
      summary: {
        rpcs: rpcs.length,
        workflows: workflows.length,
        channels: channels.length,
      },
      rpcs,
      workflows,
      channels,
    })
  },
})
