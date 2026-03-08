import { runMCPHTTPClientTest } from './mcp.js'

const baseUrl = (process.env.HELLO_WORLD_URL_PREFIX || 'http://localhost:3000').replace(/\/+$/, '')
const url = `${baseUrl}/mcp`
console.log('Starting MCP HTTP test with url:', url)
await runMCPHTTPClientTest(url)
