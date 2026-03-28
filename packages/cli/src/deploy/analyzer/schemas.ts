/**
 * Zod schemas for validating Pikku codegen metadata files.
 *
 * These schemas are derived from the actual `.pikku/*.gen.json` file formats
 * observed in the test-app -- not from assumptions.
 *
 * All object schemas use `.passthrough()` so that extra fields added in newer
 * Pikku versions don't cause validation errors.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// function/pikku-functions-meta-verbose.gen.json
// ---------------------------------------------------------------------------

const servicesBlockSchema = z
  .object({
    optimized: z.boolean(),
    services: z.array(z.string()),
  })
  .passthrough()

const wiresBlockSchema = z
  .object({
    optimized: z.boolean(),
    wires: z.array(z.string()),
  })
  .passthrough()

const functionMetaSchema = z
  .object({
    pikkuFuncId: z.string(),
    functionType: z.string(),
    name: z.string(),
    services: servicesBlockSchema.optional(),
    // Fields that may be absent on inline / system-generated functions
    funcWrapper: z.string().optional(),
    sessionless: z.boolean().optional(),
    wires: wiresBlockSchema.optional(),
    isDirectFunction: z.boolean().optional(),
    inputSchemaName: z.string().nullable().optional(),
    outputSchemaName: z.string().nullable().optional(),
    inputs: z.array(z.string()).optional(),
    outputs: z.array(z.string()).optional(),
    description: z.string().optional(),
    expose: z.boolean().optional(),
    remote: z.boolean().optional(),
    tool: z.boolean().optional(),
    mcp: z.boolean().optional(),
    contractHash: z.string().optional(),
    inputHash: z.string().optional(),
    outputHash: z.string().optional(),
  })
  .passthrough()

export const functionsMetaVerboseSchema = z.record(
  z.string(),
  functionMetaSchema
)

export type FunctionMeta = z.infer<typeof functionMetaSchema>
export type FunctionsMetaVerbose = z.infer<typeof functionsMetaVerboseSchema>

// ---------------------------------------------------------------------------
// http/pikku-http-wirings-meta.gen.json
//
// Structure: { [method]: { [route]: { pikkuFuncId, route, method, ... } } }
// ---------------------------------------------------------------------------

const httpMiddlewareSchema = z
  .object({
    type: z.string(),
    route: z.string(),
  })
  .passthrough()

const httpRouteSchema = z
  .object({
    pikkuFuncId: z.string(),
    route: z.string(),
    method: z.string(),
    params: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    middleware: z.array(httpMiddlewareSchema).optional(),
    groupBasePath: z.string().optional(),
    sse: z.boolean().optional(),
  })
  .passthrough()

const httpMethodRoutesSchema = z.record(z.string(), httpRouteSchema)

export const httpWiringsMetaSchema = z
  .object({
    get: httpMethodRoutesSchema.optional().default({}),
    post: httpMethodRoutesSchema.optional().default({}),
    put: httpMethodRoutesSchema.optional().default({}),
    delete: httpMethodRoutesSchema.optional().default({}),
    head: httpMethodRoutesSchema.optional().default({}),
    patch: httpMethodRoutesSchema.optional().default({}),
    options: httpMethodRoutesSchema.optional().default({}),
  })
  .passthrough()

export type HttpWiringsMeta = z.infer<typeof httpWiringsMetaSchema>
export type HttpRoute = z.infer<typeof httpRouteSchema>

// ---------------------------------------------------------------------------
// queue/pikku-queue-workers-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const queueWorkerMetaSchema = z
  .object({
    pikkuFuncId: z.string(),
    name: z.string().optional(),
  })
  .passthrough()

export const queueWorkersMetaSchema = z.record(
  z.string(),
  queueWorkerMetaSchema
)

export type QueueWorkersMeta = z.infer<typeof queueWorkersMetaSchema>

// ---------------------------------------------------------------------------
// scheduler/pikku-schedulers-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const schedulerMetaSchema = z
  .object({
    pikkuFuncId: z.string(),
    schedule: z.string(),
    name: z.string().optional(),
  })
  .passthrough()

export const schedulersMetaSchema = z.record(z.string(), schedulerMetaSchema)

export type SchedulersMeta = z.infer<typeof schedulersMetaSchema>

// ---------------------------------------------------------------------------
// agent/pikku-agent-wirings-meta.gen.json
//
// Structure: { agentsMeta: { [agentName]: { name, tools, ... } } }
// ---------------------------------------------------------------------------

const agentToolSchema = z
  .object({
    pikkuFuncId: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough()

const agentMetaSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    model: z.string().optional(),
    tools: z.array(agentToolSchema).optional(),
    subAgents: z.array(z.string()).optional(),
    pikkuFuncId: z.string().optional(),
  })
  .passthrough()

export const agentsMetaSchema = z
  .object({
    agentsMeta: z.record(z.string(), agentMetaSchema),
  })
  .passthrough()

export type AgentsMeta = z.infer<typeof agentsMetaSchema>

// ---------------------------------------------------------------------------
// mcp/pikku-mcp-wirings-meta.gen.json
//
// Structure: { toolsMeta: { ... }, resourcesMeta: { ... }, promptsMeta: { ... } }
// Tools have: pikkuFuncId, name, description, inputSchema, outputSchema
// ---------------------------------------------------------------------------

const mcpToolSchema = z
  .object({
    pikkuFuncId: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    inputSchema: z.string().optional(),
    outputSchema: z.string().optional(),
  })
  .passthrough()

const mcpResourceSchema = z
  .object({
    name: z.string().optional(),
    uri: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough()

const mcpPromptSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough()

export const mcpMetaSchema = z
  .object({
    toolsMeta: z.record(z.string(), mcpToolSchema).optional().default({}),
    resourcesMeta: z
      .record(z.string(), mcpResourceSchema)
      .optional()
      .default({}),
    promptsMeta: z.record(z.string(), mcpPromptSchema).optional().default({}),
  })
  .passthrough()

export type McpMeta = z.infer<typeof mcpMetaSchema>

// ---------------------------------------------------------------------------
// channel/pikku-channels-meta.gen.json
//
// Structure: { [channelKey]: { name, route, input, connect, disconnect,
//   message, messageWirings: { command: { [cmd]: { pikkuFuncId, middleware } } },
//   binary, tags } }
// ---------------------------------------------------------------------------

const channelMiddlewareSchema = z
  .object({
    type: z.string(),
    name: z.string().optional(),
    route: z.string().optional(),
    inline: z.boolean().optional(),
  })
  .passthrough()

const channelMessageWiringSchema = z
  .object({
    pikkuFuncId: z.string(),
    middleware: z.array(channelMiddlewareSchema).optional(),
  })
  .passthrough()

const channelMetaSchema = z
  .object({
    name: z.string(),
    route: z.string().optional(),
    input: z.unknown().nullable().optional(),
    connect: z.unknown().nullable().optional(),
    disconnect: z.unknown().nullable().optional(),
    message: z.unknown().nullable().optional(),
    messageWirings: z
      .object({
        command: z
          .record(z.string(), channelMessageWiringSchema)
          .optional()
          .default({}),
      })
      .passthrough()
      .optional(),
    binary: z.unknown().nullable().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough()

export const channelsMetaSchema = z.record(z.string(), channelMetaSchema)

export type ChannelMeta = z.infer<typeof channelMetaSchema>
export type ChannelsMeta = z.infer<typeof channelsMetaSchema>

// ---------------------------------------------------------------------------
// workflow/meta/*.gen.json (non-verbose)
// ---------------------------------------------------------------------------

const workflowNodeSchema = z
  .object({
    nodeId: z.string(),
    rpcName: z.string().optional(),
    next: z.string().optional(),
    flow: z.string().optional(),
    description: z.string().optional(),
    stepHash: z.string().optional(),
    outputs: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough()

export const workflowMetaSchema = z
  .object({
    name: z.string(),
    pikkuFuncId: z.string(),
    source: z.string(),
    description: z.string().optional(),
    nodes: z.record(z.string(), workflowNodeSchema),
    entryNodeIds: z.array(z.string()),
    graphHash: z.string(),
  })
  .passthrough()

export type WorkflowMeta = z.infer<typeof workflowMetaSchema>

// ---------------------------------------------------------------------------
// secrets/pikku-secrets-meta.gen.json
//
// Can be empty `{}` or a record of secret entries.
// ---------------------------------------------------------------------------

const secretMetaSchema = z
  .object({
    name: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    secretId: z.string(),
    schema: z.string().optional(),
    sourceFile: z.string().optional(),
  })
  .passthrough()

export const secretsMetaSchema = z.record(z.string(), secretMetaSchema)

export type SecretsMeta = z.infer<typeof secretsMetaSchema>

// ---------------------------------------------------------------------------
// variables/pikku-variables-meta.gen.json
//
// Can be empty `{}` or a record of variable entries.
// ---------------------------------------------------------------------------

const variableMetaSchema = z
  .object({
    name: z.string(),
    displayName: z.string().optional(),
    description: z.string().optional(),
    variableId: z.string(),
    schema: z.string().optional(),
    sourceFile: z.string().optional(),
  })
  .passthrough()

export const variablesMetaSchema = z.record(z.string(), variableMetaSchema)

export type VariablesMeta = z.infer<typeof variablesMetaSchema>
