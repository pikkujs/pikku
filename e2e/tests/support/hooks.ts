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
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from './types.js'

// LLM calls can be slow
setDefaultTimeout(config.responseTimeout)

let backendProcess: ChildProcess | undefined

BeforeAll(async function () {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectDir = resolve(__dirname, '../..')
  const backendPort = new URL(config.apiUrl).port
  const consolePort = Number(new URL(config.consoleUrl).port)

  // Start the backend + console via pikku serve --console <port>
  // pikkuOnStart in src/lifecycle.ts handles mock OAuth + user seeding
  backendProcess = spawn(
    'npx',
    ['pikku', 'serve', '--port', backendPort, '--console', String(consolePort)],
    {
      cwd: projectDir,
      env: { ...process.env, API_URL: config.apiUrl },
      stdio: 'pipe',
      detached: true,
    }
  )

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
  // Mock OAuth and user seeding teardown is handled by pikkuOnStop in src/lifecycle.ts
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
  await this.login()
  this.recordRequests()
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
      console.log('[headed] Pausing for 10 seconds before closing browser...')
      await new Promise((r) => setTimeout(r, 10_000))
    }
    await this.closeBrowser()
  }
)
