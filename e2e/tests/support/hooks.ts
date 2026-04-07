import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  setDefaultTimeout,
  type ITestCaseHookParameter,
} from '@cucumber/cucumber'
import type { AgentWorld } from './world.js'
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { createServer, type Server } from 'http'
import { createReadStream, existsSync, statSync } from 'fs'
import { resolve, dirname, join, extname } from 'path'
import { fileURLToPath } from 'url'
import { config } from './types.js'

// LLM calls can be slow
setDefaultTimeout(config.responseTimeout)

let backendProcess: ChildProcess | undefined
let consoleServer: Server | undefined

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function startConsoleServer(distDir: string, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let filePath = join(distDir, req.url === '/' ? 'index.html' : req.url!)
      // SPA fallback: serve index.html for non-file paths
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        filePath = join(distDir, 'index.html')
      }
      const ext = extname(filePath)
      res.setHeader(
        'Content-Type',
        MIME_TYPES[ext] || 'application/octet-stream'
      )
      createReadStream(filePath).pipe(res)
    })
    server.listen(port, () => resolve(server))
    server.on('error', reject)
  })
}

BeforeAll(async function () {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectDir = resolve(__dirname, '../..')
  const backendPort = new URL(config.apiUrl).port
  const consolePort = Number(new URL(config.consoleUrl).port)

  // Start the console UI static server (only needed for @console scenarios, but
  // BeforeAll cannot inspect tags so we start it if the dist exists)
  const consoleDist = resolve(projectDir, '../packages/console/dist')
  if (existsSync(consoleDist)) {
    consoleServer = await startConsoleServer(consoleDist, consolePort)
    console.log(`[console] serving ${consoleDist} on port ${consolePort}`)
  }

  // Start the backend API server
  backendProcess = spawn('npx', ['tsx', 'bin/start.ts'], {
    cwd: projectDir,
    env: { ...process.env, PORT: backendPort },
    stdio: 'pipe',
    detached: true,
  })

  backendProcess.stderr?.on('data', (d: Buffer) =>
    process.stderr.write(`[backend] ${d}`)
  )
  backendProcess.stdout?.on('data', (d: Buffer) =>
    process.stdout.write(`[backend] ${d}`)
  )

  // Wait for the backend to be ready
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      await fetch(config.apiUrl)
      return // server is up
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Backend did not start within 30 seconds on ${config.apiUrl}`)
})

AfterAll(async function () {
  if (backendProcess) {
    backendProcess.stderr?.destroy()
    backendProcess.stdout?.destroy()
    if (backendProcess.pid) {
      try {
        process.kill(-backendProcess.pid, 'SIGTERM')
      } catch {
        // Process group may already be gone
      }
    }
    backendProcess = undefined
  }
  if (consoleServer) {
    consoleServer.close()
    consoleServer = undefined
  }
  const { stopMockOAuthServer } = await import('./mock-oauth-server.js')
  stopMockOAuthServer()
})

Before('@console', async function (this: AgentWorld) {
  this.threadId = randomUUID()
  // Reset the in-memory stores to seed data before each scenario
  await Promise.all([
    fetch(`${config.apiUrl}/rpc/todos:resetTodos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
    fetch(`${config.apiUrl}/rpc/emails:resetEmails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  ])
  await this.openBrowser()
})

After(
  '@console',
  async function (this: AgentWorld, { result }: ITestCaseHookParameter) {
    if (result?.status === 'FAILED') {
      // Take a screenshot on failure for debugging
      try {
        const screenshotPath = `tests/reports/failure-${Date.now()}.png`
        await this.page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`Screenshot saved to ${screenshotPath}`)
      } catch {
        // Ignore screenshot failures
      }
    }
    const headed = process.env.HEADED === '1' || process.env.HEADED === 'true'
    if (headed) {
      console.log('[headed] Pausing for 3 seconds before closing browser...')
      await new Promise((r) => setTimeout(r, 3_000))
    }
    await this.closeBrowser()
  }
)
