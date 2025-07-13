import { readFile } from 'fs/promises'
import { MCPResourceMeta, MCPToolMeta, MCPPromptMeta } from '@pikku/core'

export interface MCPToolEndpoint {
  name: string
  description: string
  inputSchema?: any
  outputSchema?: any
}

export interface MCPResourceEndpoint {
  uri: string
  title: string
  description: string
  inputSchema?: any
  outputSchema?: any
}

export interface MCPPromptEndpoint {
  name: string
  description: string
  inputSchema?: any
  outputSchema?: any
}

export class MCPEndpointRegistry {
  private tools: Map<string, MCPToolEndpoint> = new Map()
  private resources: Map<string, MCPResourceEndpoint> = new Map()
  private prompts: Map<string, MCPPromptEndpoint> = new Map()
  private resourcesMeta: MCPResourceMeta = {}
  private toolsMeta: MCPToolMeta = {}
  private promptsMeta: MCPPromptMeta = {}

  async loadFromMCPJson(mcpJsonPath: string): Promise<void> {
    try {
      const mcpJsonContent = await readFile(mcpJsonPath, 'utf-8')
      const mcpData = JSON.parse(mcpJsonContent)

      if (mcpData.tools && Array.isArray(mcpData.tools)) {
        for (const tool of mcpData.tools) {
          this.tools.set(tool.name, {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.parameters,
            outputSchema: tool.returns,
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
            outputSchema: resource.returns,
          })
        }
      }
      if (mcpData.prompts && Array.isArray(mcpData.prompts)) {
        for (const prompt of mcpData.prompts) {
          this.prompts.set(prompt.name, {
            name: prompt.name,
            description: prompt.description,
            inputSchema: prompt.arguments,
            outputSchema: undefined,
          })
        }
      }
    } catch (error) {
      throw new Error(`Failed to load MCP JSON from ${mcpJsonPath}: ${error}`)
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
    return Array.from(this.tools.values())
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
}
