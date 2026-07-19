import type { FunctionsMeta } from '@pikku/core'
import type { HTTPWiringsMeta } from '@pikku/core/http'
import type { ChannelsMeta } from '@pikku/core/channel'
import type { CLIProgramMeta } from '@pikku/core/cli'
import type {
  MCPToolMeta,
  MCPResourceMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'

export interface McpMeta {
  toolsMeta: MCPToolMeta
  resourcesMeta: MCPResourceMeta
  promptsMeta: MCPPromptMeta
}

export interface AddonPackageInfo {
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

export type AddonMeta = AddonPackageInfo
export type AddonDetail = AddonPackageInfo

export interface OpenApiSummary {
  name: string
  version: string
  provider: string
  service: string | null
  title: string
  description: string
  openapiVer: string
  swaggerUrl: string
  logo?: string
}

export interface OpenApiListResult {
  apis: OpenApiSummary[]
  total: number
  nextCursor: number | null
}

export interface OpenApiDetail extends OpenApiSummary {
  swaggerYamlUrl?: string
  categories: string[]
  tags: string[]
  added?: string
  updated?: string
}

export class AddonService {
  constructor(private fabricApiUrl: string) {}

  async readAddonsMeta(): Promise<AddonMeta[]> {
    const response = await fetch(
      `${this.fabricApiUrl}/registry/packages?limit=500`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    const result = await response.json()
    return result.packages ?? []
  }

  async readAddon(id: string): Promise<AddonDetail | null> {
    const response = await fetch(
      `${this.fabricApiUrl}/registry/packages/${encodeURIComponent(id)}`
    )
    if (!response.ok) return null
    const text = await response.text()
    if (!text) return null
    return JSON.parse(text)
  }

  /** Browse the fabric registry's OpenAPI catalogue (apis.guru + published). */
  async readOpenapis(opts: {
    limit: number
    offset: number
    search?: string
  }): Promise<OpenApiListResult> {
    const params = new URLSearchParams({
      limit: String(opts.limit),
      offset: String(opts.offset),
    })
    if (opts.search) params.set('query', opts.search)
    const response = await fetch(
      `${this.fabricApiUrl}/registry/openapis?${params.toString()}`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    return response.json()
  }

  /** Fetch one OpenAPI catalogue entry by name (returns null when absent). */
  async readOpenapiDetail(name: string): Promise<OpenApiDetail | null> {
    const response = await fetch(
      `${this.fabricApiUrl}/registry/openapis/${encodeURIComponent(name)}`
    )
    if (!response.ok) return null
    const text = await response.text()
    if (!text) return null
    return JSON.parse(text)
  }

  async init(): Promise<void> {}
}
