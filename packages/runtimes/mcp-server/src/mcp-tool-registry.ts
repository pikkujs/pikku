import { readFile } from 'fs/promises'
import { MCPEndpointsMeta } from '@pikku/core'

export interface MCPEndpoints {
  name: string
  description: string
  inputSchema?: any
  outputSchema?: any
}

export class MCPToolRegistry {
  private tools: Map<string, MCPEndpoints> = new Map()
  private resources: Map<string, MCPEndpoints> = new Map()
  private endpointsMeta: MCPEndpointsMeta = {}

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
            name: resource.name,
            description: resource.description,
            inputSchema: resource.parameters,
            outputSchema: resource.returns,
          })
        }
      }
    } catch (error) {
      throw new Error(`Failed to load MCP JSON from ${mcpJsonPath}: ${error}`)
    }
  }

  setEndpointsMeta(meta: MCPEndpointsMeta): void {
    this.endpointsMeta = meta
  }

  getTools(): MCPEndpoints[] {
    console.log(Array.from(this.tools.values()))
    return Array.from(this.tools.values())
  }

  getResources(): MCPEndpoints[] {
    return Array.from(this.resources.values())
  }

  getTool(name: string): MCPEndpoints | undefined {
    return this.tools.get(name)
  }

  getResource(name: string): MCPEndpoints | undefined {
    return this.resources.get(name)
  }

  hasEndpoint(name: string): boolean {
    return name in this.endpointsMeta
  }
}
