/**
 * @module @pikku/modelcontextprotocol/fetch
 *
 * The entry for runtimes that have no node builtins — Cloudflare Workers,
 * Deno. It reaches the same MCP surface as the root entry; what it leaves out
 * is the node HTTP listener and stdio.
 */

export { PikkuMCPFetchServer } from './pikku-mcp-fetch-server.js'
export type { MCPServerConfig } from './pikku-mcp-fetch-server.js'
export type { MCPAuthOptions } from './mcp-auth.js'
export { WELL_KNOWN_PRM, isBareDiscoveryPath } from './mcp-auth.js'
