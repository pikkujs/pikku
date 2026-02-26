import type { FunctionsMeta } from '@pikku/core'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ChannelsMeta } from '@pikku/core/channel'
import type { CLIProgramMeta } from '@pikku/core/cli'
import type {
  MCPToolMeta,
  MCPResourceMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'

export type { FunctionsMeta, HTTPWiringsMeta, ChannelsMeta, CLIProgramMeta }

export interface McpMeta {
  toolsMeta: MCPToolMeta
  resourcesMeta: MCPResourceMeta
  promptsMeta: MCPPromptMeta
}

export interface PackageRegistryEntry {
  id: string
  name: string
  displayName: string
  version: string
  description: string
  author: string
  repository?: string
  license?: string
  readme?: string
  icon?: string
  publishedAt: string
  updatedAt: string
  tags: string[]
  categories: string[]
  functions: FunctionsMeta
  agents: Record<string, unknown>
  secrets: Record<string, unknown>
  variables: Record<string, unknown>
  httpRoutes: HTTPWiringsMeta
  channels: ChannelsMeta
  cli: Record<string, CLIProgramMeta>
  mcp: McpMeta | null
  schemas: Record<string, unknown>
}

export interface ListOptions {
  category?: string
  tag?: string
  offset?: number
  limit?: number
}

export interface ListResult {
  packages: PackageRegistryEntry[]
  total: number
}
