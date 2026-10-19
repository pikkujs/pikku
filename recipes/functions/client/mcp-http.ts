import { runMCPHTTPClientTest } from './mcp.ts'

const baseUrl = (process.env.MCP_BASE_URL || 'http://localhost:4020').replace(
  /\/+$/,
  ''
)
const url = `${baseUrl}/mcp`

console.log('Starting MCP HTTP test with url:', url)
await runMCPHTTPClientTest(url)
