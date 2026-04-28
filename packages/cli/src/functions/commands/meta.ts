import { pikkuSessionlessFunc } from '#pikku'

function out(value: unknown): void {
  console.log(JSON.stringify(value))
}

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
  getInspectorState: () => Promise<any>,
  type: string
): Promise<Array<Record<string, unknown>>> {
  const state = await getInspectorState()
  let items: Array<Record<string, unknown>> = []

  if (type === 'http') {
    const meta = state.http?.meta ?? {}
    for (const [route, methods] of Object.entries(
      meta as Record<string, Record<string, any>>
    )) {
      for (const [method, m] of Object.entries(methods ?? {})) {
        items.push({
          id: `${method}:${route}`,
          functionId: (m as any).pikkuFuncId,
          route,
          method,
        })
      }
    }
  } else if (type === 'scheduler') {
    items = Object.entries(state.scheduledTasks?.meta ?? {}).map(
      ([functionId, m]: [string, any]) => ({
        id: m?.name ?? functionId,
        functionId,
        cron: m?.schedule ?? null,
      })
    )
  } else if (type === 'queue') {
    items = Object.entries(state.queueWorkers?.meta ?? {}).map(
      ([functionId, m]: [string, any]) => ({
        id: m?.queueName ?? functionId,
        functionId,
        queueName: m?.queueName ?? null,
      })
    )
  } else if (type === 'channel') {
    items = Object.entries(state.channels?.meta ?? {}).map(
      ([channelName, m]: [string, any]) => ({
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
    items = Object.entries(state.triggers?.meta ?? {}).map(
      ([functionId, m]: [string, any]) => ({
        id: m?.name ?? functionId,
        functionId,
        eventType: m?.type ?? null,
      })
    )
  } else {
    throw new Error(`Unsupported wire type: ${type}`)
  }
  return items
}

export const pikkuMetaWiresType = pikkuSessionlessFunc<{ type: string }, void>({
  func: async ({ getInspectorState }, data) => {
    const items = await wiresByType(getInspectorState as any, data.type)
    out({ type: data.type, items })
  },
})

export const pikkuMetaWiresHttp = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'http',
      items: await wiresByType(getInspectorState as any, 'http'),
    })
  },
})

export const pikkuMetaWiresScheduler = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'scheduler',
      items: await wiresByType(getInspectorState as any, 'scheduler'),
    })
  },
})

export const pikkuMetaWiresQueue = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'queue',
      items: await wiresByType(getInspectorState as any, 'queue'),
    })
  },
})

export const pikkuMetaWiresChannel = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'channel',
      items: await wiresByType(getInspectorState as any, 'channel'),
    })
  },
})

export const pikkuMetaWiresTrigger = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    out({
      type: 'trigger',
      items: await wiresByType(getInspectorState as any, 'trigger'),
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
      http: await wiresByType(getInspectorState as any, 'http'),
      scheduler: await wiresByType(getInspectorState as any, 'scheduler'),
      queue: await wiresByType(getInspectorState as any, 'queue'),
      channel: await wiresByType(getInspectorState as any, 'channel'),
      trigger: await wiresByType(getInspectorState as any, 'trigger'),
    }

    const capabilities = {
      http: wires.http.length > 0,
      scheduler: wires.scheduler.length > 0,
      queue: wires.queue.length > 0,
      channel: wires.channel.length > 0,
      trigger: wires.trigger.length > 0,
      workflow: workflows.length > 0,
      mcp: Object.keys((state as any).mcp?.meta ?? {}).length > 0,
      agent: Object.keys((state as any).agents?.meta ?? {}).length > 0,
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
