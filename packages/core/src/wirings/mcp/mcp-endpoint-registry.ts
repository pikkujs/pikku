import type {
  MCPResourceMeta,
  MCPToolMeta,
  MCPPromptMeta,
} from '@pikku/core/mcp'

export interface MCPToolEndpoint {
  name: string
  title: string
  description: string
  inputSchema?: any
  outputSchema?: any
  enabled: boolean
}

export interface MCPResourceEndpoint {
  uri: string
  title: string
  description: string
  inputSchema?: any
  mimeType?: string
  enabled: boolean
}

export interface MCPPromptEndpoint {
  name: string
  description: string
  inputSchema?: any
  enabled: boolean
}

export class MCPEndpointRegistry {
  private tools: Map<string, MCPToolEndpoint> = new Map()
  private resources: Map<string, MCPResourceEndpoint> = new Map()
  private prompts: Map<string, MCPPromptEndpoint> = new Map()
  private resourcesMeta: MCPResourceMeta = {}
  private toolsMeta: MCPToolMeta = {}
  private promptsMeta: MCPPromptMeta = {}

  async loadFromMCPJson(mcpData: any): Promise<void> {
    if (mcpData.tools && Array.isArray(mcpData.tools)) {
      for (const tool of mcpData.tools) {
        this.tools.set(tool.name, {
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.parameters,
          outputSchema: tool.returns,
          enabled: tool.enabled !== undefined ? tool.enabled : true,
        })
      }
    }
    if (mcpData.resources && Array.isArray(mcpData.resources)) {
      for (const resource of mcpData.resources) {
        this.resources.set(resource.name, {
          title: resource.name,
          uri: resource.uri,
          description: resource.description,
          inputSchema: resource.parameters,
          enabled: resource.enabled !== undefined ? resource.enabled : true,
        })
      }
    }
    if (mcpData.prompts && Array.isArray(mcpData.prompts)) {
      for (const prompt of mcpData.prompts) {
        this.prompts.set(prompt.name, {
          name: prompt.name,
          description: prompt.description,
          inputSchema: prompt.arguments,
          enabled: prompt.enabled !== undefined ? prompt.enabled : true,
        })
      }
    }
  }

  setResourcesMeta(meta: MCPResourceMeta): void {
    this.resourcesMeta = meta
  }

  setToolsMeta(meta: MCPToolMeta): void {
    this.toolsMeta = meta
  }

  setPromptsMeta(meta: MCPPromptMeta): void {
    this.promptsMeta = meta
  }

  getTools(): MCPToolEndpoint[] {
    return Array.from(this.tools.values()).filter((tool) => tool.enabled)
  }

  getResources(): MCPResourceEndpoint[] {
    return Array.from(this.resources.values())
  }

  getPrompts(): MCPPromptEndpoint[] {
    return Array.from(this.prompts.values())
  }

  getTool(name: string): MCPToolEndpoint | undefined {
    return this.tools.get(name)
  }

  getResource(name: string): MCPResourceEndpoint | undefined {
    return this.resources.get(name)
  }

  getPrompt(name: string): MCPPromptEndpoint | undefined {
    return this.prompts.get(name)
  }

  hasResource(name: string): boolean {
    return name in this.resourcesMeta
  }

  hasTool(name: string): boolean {
    return name in this.toolsMeta
  }

  hasPrompt(name: string): boolean {
    return name in this.promptsMeta
  }

  enableTools(tools: Record<any, boolean>): boolean {
    let changed = false
    for (const [name, enabled] of Object.entries(tools)) {
      const tool = this.tools.get(name)
      if (tool && tool.enabled !== enabled) {
        tool.enabled = enabled
        changed = true
      }
    }
    return changed
  }

  enablePrompts(prompts: Record<any, boolean>): boolean {
    let changed = false
    for (const [name, enabled] of Object.entries(prompts)) {
      const prompt = this.prompts.get(name)
      if (prompt && prompt.enabled !== enabled) {
        prompt.enabled = enabled
        changed = true
      }
    }
    return changed
  }

  enableResources(resources: Record<any, boolean>): boolean {
    let changed = false
    for (const [name, enabled] of Object.entries(resources)) {
      const resource = this.resources.get(name)
      if (resource && resource.enabled !== enabled) {
        resource.enabled = enabled
        changed = true
      }
    }
    return changed
  }
}
