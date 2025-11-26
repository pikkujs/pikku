/**
 * Generates type definitions for MCP wirings
 */
export const serializeMCPTypes = (functionTypesImportPath: string) => {
  return `/**
 * MCP-specific type definitions for tree-shaking optimization
 */

import {
  CoreMCPResource,
  CoreMCPTool,
  CoreMCPPrompt,
  wireMCPResource as wireMCPResourceCore,
  wireMCPTool as wireMCPToolCore,
  wireMCPPrompt as wireMCPPromptCore,
  MCPResourceResponse,
  MCPToolResponse,
  MCPPromptResponse,
  AssertMCPResourceURIParams
} from '@pikku/core/mcp'

import type { PikkuFunctionConfig, PikkuFunctionSessionless, InferZodOutput } from '${functionTypesImportPath}'
import type { ZodLike } from '@pikku/core'

/**
 * Type definition for MCP resources that provide data to AI models.
 *
 * @template In - Input type for the resource request
 * @template URI - URI template string type for compile-time parameter validation
 */
type MCPResourceWiring<In, URI extends string> = CoreMCPResource<PikkuFunctionConfig<In, MCPResourceResponse, 'rpc' | 'session' | 'mcp'>> & { uri: URI }

/**
 * Type definition for MCP tools that AI models can invoke.
 *
 * @template In - Input type for the tool invocation
 */
type MCPToolWiring<In> = CoreMCPTool<PikkuFunctionConfig<In, MCPToolResponse, 'rpc' | 'session' | 'mcp'>>

/**
 * Type definition for MCP prompts that provide templates to AI models.
 *
 * @template In - Input type for the prompt parameters
 */
type MCPPromptWiring<In> = CoreMCPPrompt<PikkuFunctionConfig<In, MCPPromptResponse, 'rpc' | 'session' | 'mcp'>>

/**
 * Registers an MCP resource with the Pikku framework.
 * Resources provide data that AI models can access.
 *
 * @template In - Input type for the resource request
 * @template URI - URI template string for compile-time parameter validation
 * @param mcpResource - MCP resource definition with data provider function
 */
export const wireMCPResource = <In, URI extends string>(
  mcpResource: MCPResourceWiring<In, URI> & AssertMCPResourceURIParams<In, URI>
) => {
  wireMCPResourceCore(mcpResource as any)
}

/**
 * Registers an MCP tool with the Pikku framework.
 * Tools are functions that AI models can invoke.
 *
 * @template In - Input type for the tool invocation
 * @param mcpTool - MCP tool definition with action function
 */
export const wireMCPTool = <In>(
  mcpTool: MCPToolWiring<In>
) => {
  wireMCPToolCore(mcpTool as any)
}

/**
 * Registers an MCP prompt with the Pikku framework.
 * Prompts provide templates that AI models can use.
 *
 * @template In - Input type for the prompt parameters
 * @param mcpPrompt - MCP prompt definition with template function
 */
export const wireMCPPrompt = <In>(
  mcpPrompt: MCPPromptWiring<In>
) => {
  wireMCPPromptCore(mcpPrompt as any)
}

/**
 * Configuration for MCP prompt with Zod schema input validation.
 */
type MCPPromptFuncConfigWithSchema<InputSchema extends ZodLike> = {
  func: PikkuFunctionSessionless<InferZodOutput<InputSchema>, MCPPromptResponse, 'mcp'>
  name?: string
  input: InputSchema
}

/**
 * Creates a function for handling MCP prompt requests.
 * These functions generate prompt templates for AI models.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuMCPPromptFunc<Input>({ func: ... })\`
 * 2. Zod schemas: \`pikkuMCPPromptFunc({ input: z.object(...), func: ... })\`
 *
 * @template In - Input type for the prompt parameters (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 */
export function pikkuMCPPromptFunc<InputSchema extends ZodLike>(
  config: MCPPromptFuncConfigWithSchema<InputSchema>
): PikkuFunctionConfig<InferZodOutput<InputSchema>, MCPPromptResponse, 'mcp'>
export function pikkuMCPPromptFunc<In>(
  func:
    | PikkuFunctionSessionless<In, MCPPromptResponse, 'mcp'>
    | {
        func: PikkuFunctionSessionless<In, MCPPromptResponse, 'mcp'>
        name?: string
      }
): PikkuFunctionConfig<In, MCPPromptResponse, 'mcp'>
export function pikkuMCPPromptFunc(func: any): any {
  return typeof func === 'function' ? { func } : func
}

/**
 * Configuration for MCP tool with Zod schema input validation.
 */
type MCPToolFuncConfigWithSchema<InputSchema extends ZodLike> = {
  func: PikkuFunctionSessionless<InferZodOutput<InputSchema>, MCPToolResponse, 'mcp'>
  name?: string
  input: InputSchema
}

/**
 * Creates a function for handling MCP tool invocations.
 * These functions perform actions that AI models can request.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuMCPToolFunc<Input>({ func: ... })\`
 * 2. Zod schemas: \`pikkuMCPToolFunc({ input: z.object(...), func: ... })\`
 *
 * @template In - Input type for the tool invocation (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 */
export function pikkuMCPToolFunc<InputSchema extends ZodLike>(
  config: MCPToolFuncConfigWithSchema<InputSchema>
): PikkuFunctionConfig<InferZodOutput<InputSchema>, MCPToolResponse, 'mcp'>
export function pikkuMCPToolFunc<In>(
  func:
    | PikkuFunctionSessionless<In, MCPToolResponse, 'mcp'>
    | {
      func: PikkuFunctionSessionless<In, MCPToolResponse, 'mcp'>
      name?: string
    }
): PikkuFunctionConfig<In, MCPToolResponse, 'mcp'>
export function pikkuMCPToolFunc(func: any): any {
  return typeof func === 'function' ? { func } : func
}

/**
 * Configuration for MCP resource with Zod schema input validation.
 */
type MCPResourceFuncConfigWithSchema<InputSchema extends ZodLike> = {
  func: PikkuFunctionSessionless<InferZodOutput<InputSchema>, MCPResourceResponse, 'mcp'>
  name?: string
  input: InputSchema
}

/**
 * Creates a function for handling MCP resource requests.
 * These functions provide data that AI models can access.
 *
 * Supports two patterns:
 * 1. Generic types: \`pikkuMCPResourceFunc<Input>({ func: ... })\`
 * 2. Zod schemas: \`pikkuMCPResourceFunc({ input: z.object(...), func: ... })\`
 *
 * @template In - Input type for the resource request (inferred from schema if provided)
 * @param func - Function definition, either direct function or configuration object
 * @returns The unwrapped function for internal use
 */
export function pikkuMCPResourceFunc<InputSchema extends ZodLike>(
  config: MCPResourceFuncConfigWithSchema<InputSchema>
): PikkuFunctionConfig<InferZodOutput<InputSchema>, MCPResourceResponse, 'mcp'>
export function pikkuMCPResourceFunc<In>(
  func:
    | PikkuFunctionSessionless<In, MCPResourceResponse, 'mcp'>
    | {
      func: PikkuFunctionSessionless<In, MCPResourceResponse, 'mcp'>
      name?: string
    }
): PikkuFunctionConfig<In, MCPResourceResponse, 'mcp'>
export function pikkuMCPResourceFunc(func: any): any {
  return typeof func === 'function' ? { func } : func
}
`
}
