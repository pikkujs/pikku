import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'path'

export type McpManifest = {
  mcpPath?: string
  tools?: unknown[]
  resources?: unknown[]
  prompts?: unknown[]
}

export type McpSurfaceMount = {
  mcpJson: McpManifest
  mcpPath: string
}

/**
 * A manifest with nothing in it reads as "no MCP here": the transports mount
 * only when there is something to serve, so an empty one would announce an
 * endpoint that answers every call with a missing tool.
 *
 * Absent or unparseable is not an error either — an app with no MCP wirings
 * has no manifest, and that is the common case.
 */
const readMcpManifest = (
  file: string,
  onWarning: (message: string) => void
): McpManifest | undefined => {
  if (!existsSync(file)) return undefined
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as McpManifest
    const count =
      (parsed.tools?.length ?? 0) +
      (parsed.resources?.length ?? 0) +
      (parsed.prompts?.length ?? 0)
    return count > 0 ? parsed : undefined
  } catch (err) {
    onWarning(
      `[pikku] could not parse ${file} — MCP will not be served: ${err instanceof Error ? err.message : String(err)}`
    )
    return undefined
  }
}

/**
 * Every MCP endpoint the generated tree describes: the default one, plus one
 * per surface for a project that serves several connectors.
 *
 * Dev mounts all of them so a connector can be pointed at `pikku dev` and tried
 * before it is deployed. Without the surfaces, a project that moved its tools
 * onto their own endpoints would serve nothing locally at all — the default
 * manifest it does read is empty precisely because they moved.
 *
 * A surface manifest without an `mcpPath` is skipped rather than guessed at: the
 * path is what the deployed unit is routed on, and a mount at a different path
 * would make dev disagree with production.
 */
export const readMcpManifests = (
  pikkuDir: string,
  onWarning: (message: string) => void
): { mcpJson?: McpManifest; mcpSurfaces: McpSurfaceMount[] } => {
  const mcpDir = join(pikkuDir, 'mcp')
  const mcpJson = readMcpManifest(join(mcpDir, 'mcp.gen.json'), onWarning)

  const mcpSurfaces = (existsSync(mcpDir) ? readdirSync(mcpDir) : [])
    .filter((name) => /^mcp\..+\.gen\.json$/.test(name))
    .sort()
    .flatMap((name) => {
      const parsed = readMcpManifest(join(mcpDir, name), onWarning)
      if (!parsed?.mcpPath) return []
      return [{ mcpJson: parsed, mcpPath: parsed.mcpPath }]
    })

  return { mcpJson, mcpSurfaces }
}
