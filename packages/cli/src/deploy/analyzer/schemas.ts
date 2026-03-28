/**
 * Zod schemas for validating Pikku codegen metadata files.
 *
 * These schemas are derived from the actual `.pikku/*.gen.json` file formats
 * observed in the codebase -- not from assumptions.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// function/pikku-functions-meta-verbose.gen.json
// ---------------------------------------------------------------------------

const servicesBlockSchema = z.object({
  optimized: z.boolean(),
  services: z.array(z.string()),
})

const wiresBlockSchema = z.object({
  optimized: z.boolean(),
  wires: z.array(z.string()),
})

const functionMetaSchema = z.object({
  pikkuFuncId: z.string(),
  functionType: z.string(),
  funcWrapper: z.string(),
  sessionless: z.boolean(),
  name: z.string(),
  services: servicesBlockSchema.optional(),
  wires: wiresBlockSchema.optional(),
  inputSchemaName: z.string().nullable().optional(),
  outputSchemaName: z.string().nullable().optional(),
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  description: z.string().optional(),
  expose: z.boolean().optional(),
  remote: z.boolean().optional(),
  tool: z.boolean().optional(),
  isDirectFunction: z.boolean(),
  contractHash: z.string().optional(),
  inputHash: z.string().optional(),
  outputHash: z.string().optional(),
})

export const functionsMetaVerboseSchema = z.record(
  z.string(),
  functionMetaSchema
)

export type FunctionMeta = z.infer<typeof functionMetaSchema>
export type FunctionsMetaVerbose = z.infer<typeof functionsMetaVerboseSchema>

// ---------------------------------------------------------------------------
// http/pikku-http-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const httpMiddlewareSchema = z.object({
  type: z.string(),
  route: z.string(),
})

const httpRouteSchema = z.object({
  pikkuFuncId: z.string(),
  route: z.string(),
  method: z.string(),
  params: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  middleware: z.array(httpMiddlewareSchema).optional(),
  groupBasePath: z.string().optional(),
  sse: z.boolean().optional(),
})

const httpMethodRoutesSchema = z.record(z.string(), httpRouteSchema)

export const httpWiringsMetaSchema = z.object({
  get: httpMethodRoutesSchema.optional().default({}),
  post: httpMethodRoutesSchema.optional().default({}),
  put: httpMethodRoutesSchema.optional().default({}),
  delete: httpMethodRoutesSchema.optional().default({}),
  head: httpMethodRoutesSchema.optional().default({}),
  patch: httpMethodRoutesSchema.optional().default({}),
  options: httpMethodRoutesSchema.optional().default({}),
})

export type HttpWiringsMeta = z.infer<typeof httpWiringsMetaSchema>
export type HttpRoute = z.infer<typeof httpRouteSchema>

// ---------------------------------------------------------------------------
// queue/pikku-queue-workers-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const queueWorkerMetaSchema = z.object({
  pikkuFuncId: z.string(),
  name: z.string(),
})

export const queueWorkersMetaSchema = z.record(
  z.string(),
  queueWorkerMetaSchema
)

export type QueueWorkersMeta = z.infer<typeof queueWorkersMetaSchema>

// ---------------------------------------------------------------------------
// scheduler/pikku-schedulers-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const schedulerMetaSchema = z.object({
  pikkuFuncId: z.string(),
  schedule: z.string(),
  name: z.string().optional(),
})

export const schedulersMetaSchema = z.record(z.string(), schedulerMetaSchema)

export type SchedulersMeta = z.infer<typeof schedulersMetaSchema>

// ---------------------------------------------------------------------------
// agent/pikku-agent-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const agentToolSchema = z.object({
  pikkuFuncId: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
})

const agentMetaSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  tools: z.array(agentToolSchema).optional(),
  subAgents: z.array(z.string()).optional(),
  pikkuFuncId: z.string().optional(),
})

export const agentsMetaSchema = z.object({
  agentsMeta: z.record(z.string(), agentMetaSchema),
})

export type AgentsMeta = z.infer<typeof agentsMetaSchema>

// ---------------------------------------------------------------------------
// mcp/pikku-mcp-wirings-meta.gen.json
// ---------------------------------------------------------------------------

const mcpToolSchema = z.object({
  pikkuFuncId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
})

const mcpResourceSchema = z.object({
  name: z.string().optional(),
  uri: z.string().optional(),
  description: z.string().optional(),
})

const mcpPromptSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
})

export const mcpMetaSchema = z.object({
  toolsMeta: z.record(z.string(), mcpToolSchema).optional().default({}),
  resourcesMeta: z.record(z.string(), mcpResourceSchema).optional().default({}),
  promptsMeta: z.record(z.string(), mcpPromptSchema).optional().default({}),
})

export type McpMeta = z.infer<typeof mcpMetaSchema>

// ---------------------------------------------------------------------------
// channel/pikku-channels-meta.gen.json
// ---------------------------------------------------------------------------

const channelMetaSchema = z.object({
  pikkuFuncId: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
})

export const channelsMetaSchema = z.record(z.string(), channelMetaSchema)

export type ChannelsMeta = z.infer<typeof channelsMetaSchema>

// ---------------------------------------------------------------------------
// workflow/meta/*.gen.json (non-verbose)
// ---------------------------------------------------------------------------

const workflowNodeSchema = z.object({
  nodeId: z.string(),
  rpcName: z.string().optional(),
  next: z.string().optional(),
  flow: z.string().optional(),
  description: z.string().optional(),
  stepHash: z.string().optional(),
  outputs: z.record(z.string(), z.unknown()).optional(),
})

export const workflowMetaSchema = z.object({
  name: z.string(),
  pikkuFuncId: z.string(),
  source: z.string(),
  description: z.string().optional(),
  nodes: z.record(z.string(), workflowNodeSchema),
  entryNodeIds: z.array(z.string()),
  graphHash: z.string(),
})

export type WorkflowMeta = z.infer<typeof workflowMetaSchema>

// ---------------------------------------------------------------------------
// secrets/pikku-secrets-meta.gen.json
// ---------------------------------------------------------------------------

const secretMetaSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  secretId: z.string(),
  schema: z.string().optional(),
  sourceFile: z.string().optional(),
})

export const secretsMetaSchema = z.record(z.string(), secretMetaSchema)

export type SecretsMeta = z.infer<typeof secretsMetaSchema>

// ---------------------------------------------------------------------------
// variables/pikku-variables-meta.gen.json
// ---------------------------------------------------------------------------

const variableMetaSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  variableId: z.string(),
  schema: z.string().optional(),
  sourceFile: z.string().optional(),
})

export const variablesMetaSchema = z.record(z.string(), variableMetaSchema)

export type VariablesMeta = z.infer<typeof variablesMetaSchema>
