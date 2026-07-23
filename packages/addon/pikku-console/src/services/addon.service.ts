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
  /**
   * OAuth2 + wire credentials the addon declares (from its own
   * `credentials/pikku-credentials-meta.gen.json`). Entries with an `oauth2`
   * field are OAuth integrations to connect; the rest are wire credentials.
   */
  credentials: Record<string, unknown>
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

/** One page of the addon catalogue, as the registry returns it. */
export interface AddonMetaPage {
  packages: AddonMeta[]
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

export interface AddonMetaQuery {
  cursor?: number
  limit?: number
  /** Free-text search. Applied by the registry, across the whole catalogue. */
  search?: string
  category?: string
  sort?: 'name' | 'functions' | 'agents'
  /** First-party @pikku/addon-* packages only. */
  official?: boolean
  /** Comma-separated package names — the gallery's "Installed" filter. */
  names?: string
}

export class AddonService {
  constructor(private fabricApiUrl: string) {}

  async readAddonsMeta(query: AddonMetaQuery = {}): Promise<AddonMetaPage> {
    const params = new URLSearchParams()
    if (query.cursor != null) params.set('cursor', String(query.cursor))
    params.set('limit', String(query.limit ?? 50))
    // The registry calls the free-text param `query`; the console calls it
    // `search` everywhere, so the rename happens here rather than in the UI.
    if (query.search) params.set('query', query.search)
    if (query.category) params.set('category', query.category)
    if (query.sort) params.set('sort', query.sort)
    if (query.official) params.set('official', 'true')
    // Sent even when empty: an empty name list means "nothing installed", which
    // must return nothing rather than falling back to the whole catalogue.
    if (query.names != null) params.set('names', query.names)

    const response = await fetch(
      `${this.fabricApiUrl}/registry/packages?${params}`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    const result = await response.json()
    return {
      packages: result.packages ?? [],
      total: result.total ?? 0,
      nextCursor: result.nextCursor ?? null,
    }
  }

  /** Catalogue-wide category counts, for the gallery's category rail. */
  async readAddonCategories(): Promise<Record<string, number>> {
    const response = await fetch(
      `${this.fabricApiUrl}/registry/packages/categories`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    // A registry without this route matches `/registry/packages/:id` instead and
    // answers 204 with no body. The rail is decoration — degrade to no counts
    // rather than taking the whole catalogue down with a parse error.
    const text = await response.text()
    if (!text) return {}
    return JSON.parse(text)
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
    category?: string
  }): Promise<OpenApiListResult> {
    const params = new URLSearchParams({
      limit: String(opts.limit),
      offset: String(opts.offset),
    })
    if (opts.search) params.set('query', opts.search)
    if (opts.category) params.set('category', opts.category)
    const response = await fetch(
      `${this.fabricApiUrl}/registry/openapis?${params.toString()}`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    return response.json()
  }

  /** Catalogue-wide category counts for the OpenAPI gallery's category rail. */
  async readOpenapiCategories(): Promise<Record<string, number>> {
    const response = await fetch(
      `${this.fabricApiUrl}/registry/openapis/categories`
    )
    if (!response.ok) {
      throw new Error(`Registry returned ${response.status}`)
    }
    // A registry without this route matches `/registry/openapis/:name` instead
    // and answers 204 with no body. The rail is decoration — degrade to no
    // counts rather than failing the catalogue on a parse error.
    const text = await response.text()
    if (!text) return {}
    return JSON.parse(text)
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
