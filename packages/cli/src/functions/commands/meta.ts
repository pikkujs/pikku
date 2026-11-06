import { pikkuSessionlessFunc } from '#pikku/function'
import { getSchema } from '@pikku/core/schema'
import type { CodeEditOperation } from '@pikku/code-edit'
import { existsSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { databaseContext } from '../db/db-context.js'
import {
  type DbTable,
  type MetaRow,
  dbColumnRows,
  dbTableRows,
  emailLocales,
  emailRows,
  formatCompactContext,
  formatMetaMatches,
  formatMetaRows,
  interfaceRows,
  matchMetaRows,
  parseDbSchema,
  parseMetaTerms,
  screenRows,
  translationRows,
} from './meta-lines.js'

function out(value: unknown): void {
  console.log(JSON.stringify(value))
}

type OutputLogger = { getOutputMode(): 'text' | 'json' }

/** Short lines for an agent to read, or the same rows as JSON. */
const printRows = (
  rows: MetaRow[],
  logger: OutputLogger,
  options?: { withKind?: boolean }
): void => {
  if (logger.getOutputMode() === 'json') out({ rows })
  else console.log(formatMetaRows(rows, options))
}

const readDbTables = async (config: any): Promise<DbTable[] | null> => {
  const schemaFile = join(config.outDir, 'db', 'schema.gen.ts')
  if (!existsSync(schemaFile)) return null
  return parseDbSchema(await readFile(schemaFile, 'utf8'))
}

const frontendDirs = (config: any): string[] =>
  Object.values((config.frontends ?? {}) as Record<string, { cwd?: string }>)
    .filter((frontend) => frontend.cwd)
    .map((frontend) => resolve(config.rootDir, frontend.cwd!))

const readScreens = (config: any): MetaRow[] =>
  frontendDirs(config).flatMap((dir) => screenRows(dir, config.rootDir))

const emailsDirOf = (config: any): string =>
  resolve(config.rootDir, config.emailTemplatesDir || 'emails')

/** Translation folders: each frontend's `messages`, plus the emails' locales. */
const messageDirs = (config: any): string[] => {
  const appsDir = join(config.rootDir, 'apps')
  const apps = existsSync(appsDir)
    ? readdirSync(appsDir).map((app) => join(appsDir, app))
    : []
  return [
    ...new Set([
      ...[...frontendDirs(config), ...apps].map((dir) => join(dir, 'messages')),
      join(emailsDirOf(config), 'locales'),
    ]),
  ]
}

const readServiceRows = (state: any, config: any): MetaRow[] => {
  const fromFile = (
    kind: string,
    declared: { file: string; type: string } | undefined
  ): MetaRow[] =>
    declared
      ? interfaceRows(
          kind,
          resolve(config.rootDir, declared.file),
          declared.type
        )
      : []
  const { userSessionType, singletonServicesType } = state.filesAndMethods
  const auth = state.auth?.definition
  return [
    ...fromFile('session', userSessionType),
    ...fromFile('service', singletonServicesType),
    ...(auth
      ? [
          {
            kind: 'auth',
            name: auth.exportName,
            detail: [
              auth.basePath,
              auth.hasCredentials ? 'email and password' : '',
              ...(state.auth.providers ?? []),
              ...(state.auth.plugins ?? []),
            ]
              .filter(Boolean)
              .join(', '),
            source: relative(config.rootDir, auth.sourceFile),
          },
        ]
      : []),
  ]
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

export const pikkuMetaSchemasList = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState }) => {
    const state = await getInspectorState()
    const schemaNames = Object.keys(state.schemas ?? {}).sort()
    out({ schemaNames })
  },
})

export const pikkuMetaSchemasGet = pikkuSessionlessFunc<
  { schemaName: string },
  void
>({
  func: async ({ getInspectorState }, data) => {
    const state = await getInspectorState()
    const schema =
      state.schemas?.[data.schemaName] ?? getSchema(data.schemaName)
    if (!schema) throw new Error(`Schema not found: ${data.schemaName}`)
    out({
      schemaName: data.schemaName,
      jsonSchema: schema,
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
export const pikkuMetaContext = pikkuSessionlessFunc<{ full?: boolean }, void>({
  func: async ({ getInspectorState, config, logger }, data) => {
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

    if (!data?.full && logger.getOutputMode() !== 'json') {
      const tables = (await readDbTables(config)) ?? []
      console.log(
        formatCompactContext({
          functions,
          workflows: workflows.map((workflow) => workflow.name),
          permissions: permissions.map((permission) => permission.name),
          middleware: middleware.map((entry) => entry.name),
          wires: summary.wires,
          tables: tables.map(({ table }) => table),
          screens: readScreens(config),
          emails: emailRows(emailsDirOf(config), config.rootDir).map(
            (row) => row.name
          ),
        })
      )
      return
    }

    out({
      schemaVersion: 'meta-context.v1',
      summary,
      capabilities,
      layout,
      db: await databaseContext(config as any),
      functions,
      middleware,
      permissions,
      workflows,
      wires,
    })
  },
})

/**
 * Where a project's tables are declared and what turns them into SQL, plus the
 * generated tables. Name tables to get their column types from the generated
 * schema, with no database running.
 *
 * Migration paths are left out on purpose. An agent that is told where they live
 * will edit them; declaring a table and running two commands is the whole job.
 */
export const pikkuMetaDb = pikkuSessionlessFunc<{ tables?: string[] }, void>({
  func: async ({ config, logger }, data) => {
    const tables = await readDbTables(config)
    if (!data?.tables?.length) {
      out({
        schemaVersion: 'meta-db.v1',
        ...(await databaseContext(config as any)),
        generated: dbTableRows(tables ?? []),
      })
      return
    }
    if (!tables) {
      throw new Error(
        'No generated database schema. Run `pikku db migrate` first.'
      )
    }
    const rows = data.tables.flatMap((name) => {
      const wanted = name.toLowerCase()
      const table = tables.find(({ table }) => table.toLowerCase() === wanted)
      if (!table) {
        throw new Error(
          `No table "${name}". Tables: ${tables.map(({ table }) => table).join(', ')}`
        )
      }
      return dbColumnRows(table)
    })
    printRows(rows, logger)
  },
})

/** Each route of each frontend: its page file and the RPCs that page reaches. */
export const pikkuMetaScreens = pikkuSessionlessFunc<{}, void>({
  func: async ({ config, logger }) => {
    printRows(readScreens(config), logger)
  },
})

/** What a function can be handed: session fields, project services, auth. */
export const pikkuMetaServices = pikkuSessionlessFunc<{}, void>({
  func: async ({ getInspectorState, config, logger }) => {
    const state = await getInspectorState()
    printRows(readServiceRows(state, config), logger, { withKind: true })
  },
})

/** Email templates with the data each takes, and the locales they come in. */
export const pikkuMetaEmails = pikkuSessionlessFunc<{}, void>({
  func: async ({ config, logger }) => {
    const emailsDir = emailsDirOf(config)
    const rows = emailRows(emailsDir, config.rootDir)
    const locales = emailLocales(emailsDir)
    printRows(
      [
        ...rows,
        ...(locales.length > 0
          ? [{ kind: 'locales', name: 'locales', detail: locales.join(', ') }]
          : []),
      ],
      logger
    )
  },
})

/** Everything `pikku meta grep` searches, as the rows every listing shares. */
const readProjectRows = async (
  getInspectorState: () => Promise<any>,
  config: any
): Promise<MetaRow[]> => {
  const state = await getInspectorState()
  const functions = (state.functions.meta ?? {}) as Record<string, any>
  const inProject = (file: string | null | undefined): string | undefined =>
    file ? relative(config.rootDir, resolve(config.rootDir, file)) : undefined
  const definitions = (kind: string, entries: Record<string, any>): MetaRow[] =>
    Object.entries(entries).map(([id, entry]) => ({
      kind,
      name: id,
      detail: entry?.description ?? undefined,
      source: inProject(entry?.sourceFile),
    }))

  const wires = await Promise.all(
    ['http', 'scheduler', 'queue', 'channel', 'trigger'].map(async (type) =>
      (await wiresByType(getInspectorState, type)).map((wire) => ({
        kind: 'wire',
        name: `${type} ${wire.id}`,
        detail: (wire.functionId as string | null) ?? undefined,
        source: inProject(functions[wire.functionId as string]?.sourceFile),
      }))
    )
  )
  const schemaFile = relative(
    config.rootDir,
    join(config.outDir, 'db', 'schema.gen.ts')
  )
  const tables = (await readDbTables(config)) ?? []
  const emailsDir = emailsDirOf(config)

  return [
    ...definitions('function', functions),
    ...Object.entries(state.workflows?.meta ?? {}).map(
      ([id, workflow]: [string, any]) => ({
        kind: 'workflow',
        name: id,
        detail: workflow?.description ?? undefined,
        source: inProject(functions[workflow?.pikkuFuncId ?? id]?.sourceFile),
      })
    ),
    ...wires.flat(),
    ...definitions('permission', state.permissions?.definitions ?? {}),
    ...definitions('middleware', state.middleware?.definitions ?? {}),
    ...Object.entries(config.clientFiles ?? {}).map(([name, file]) => ({
      kind: 'client',
      name,
      detail: typeof file === 'string' ? file : undefined,
      source: 'pikku.config.json',
    })),
    ...tables.flatMap((table) => [
      { kind: 'table', name: table.table, source: schemaFile },
      ...dbColumnRows(table).map((row) => ({ ...row, source: schemaFile })),
    ]),
    ...readScreens(config),
    ...readServiceRows(state, config),
    ...emailRows(emailsDir, config.rootDir),
    ...messageDirs(config).flatMap((dir) =>
      translationRows(dir, config.rootDir)
    ),
    ...Object.entries(config.models ?? {}).map(([alias, model]) => ({
      kind: 'model',
      name: alias,
      detail: typeof model === 'string' ? model : JSON.stringify(model),
      source: 'pikku.config.json',
    })),
  ]
}

/** One search across the project, grouped by kind. */
export const pikkuMetaGrep = pikkuSessionlessFunc<{ terms: string[] }, void>({
  func: async ({ getInspectorState, config, logger }, data) => {
    const terms = parseMetaTerms(data.terms)
    if (terms.length === 0) throw new Error('Give at least one term to search.')
    const matches = matchMetaRows(
      await readProjectRows(getInspectorState as any, config),
      terms
    )
    if (logger.getOutputMode() === 'json') out(matches)
    else console.log(formatMetaMatches(matches, terms))
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

    const channels = Object.entries((state as any).channels?.meta ?? {}).map(
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

async function readOperationsInput(file: string | undefined): Promise<unknown> {
  const raw = file
    ? await readFile(resolve(file), 'utf-8')
    : await new Promise<string>((res, rej) => {
        let buffer = ''
        process.stdin.setEncoding('utf-8')
        process.stdin.on('data', (chunk) => (buffer += chunk))
        process.stdin.on('end', () => res(buffer))
        process.stdin.on('error', rej)
      })

  if (!raw.trim()) {
    throw new Error(
      file
        ? `${file} is empty`
        : 'No operations on stdin. Pass a file, or pipe JSON in.'
    )
  }

  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `Could not parse operations as JSON: ${(e as Error).message}`
    )
  }
}

function parseOperations(input: unknown): CodeEditOperation[] {
  const operations = Array.isArray(input)
    ? input
    : (input as { operations?: unknown })?.operations

  if (!Array.isArray(operations)) {
    throw new Error(
      'Expected an array of operations, or an object with an "operations" array'
    )
  }

  const kinds = ['functionConfig', 'functionBody', 'agentConfig']

  operations.forEach((operation, index) => {
    const at = `operations[${index}]`
    if (!operation || typeof operation !== 'object') {
      throw new Error(`${at} is not an object`)
    }
    const { kind, sourceFile, exportedName } = operation as Record<
      string,
      unknown
    >
    if (typeof kind !== 'string' || !kinds.includes(kind)) {
      throw new Error(`${at}.kind must be one of ${kinds.join(', ')}`)
    }
    if (typeof sourceFile !== 'string' || !sourceFile) {
      throw new Error(`${at}.sourceFile must be a non-empty string`)
    }
    if (typeof exportedName !== 'string' || !exportedName) {
      throw new Error(`${at}.exportedName must be a non-empty string`)
    }
  })

  return operations as CodeEditOperation[]
}

export const pikkuMetaApply = pikkuSessionlessFunc<{ file?: string }, void>({
  func: async ({ config }, data) => {
    const operations = parseOperations(await readOperationsInput(data.file))

    const rootDir = (config as any).rootDir ?? process.cwd()
    // Imported here: code-edit loads the TypeScript compiler.
    const { CodeEditService } = await import('@pikku/code-edit')
    const codeEdit = new CodeEditService(rootDir)
    const files = await codeEdit.applyOperations(operations)

    out({
      schemaVersion: 'meta-apply.v1',
      applied: operations.length,
      files: files.map((f) => relative(rootDir, f)),
      generatedMetaIsStale: operations.some((o) => o.kind !== 'functionBody'),
    })
  },
})
