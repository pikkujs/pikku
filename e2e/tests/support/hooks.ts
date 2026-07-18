import {
  Before,
  After,
  BeforeAll,
  AfterAll,
  setDefaultTimeout,
  type ITestCaseHookParameter,
} from '@cucumber/cucumber'
import type { AgentWorld } from './world.js'
import { STAFF_USER } from '../../src/auth-fixtures.js'
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from './types.js'
import { GUEST_USER } from '../../src/auth-fixtures.js'

// LLM calls can be slow
setDefaultTimeout(config.responseTimeout)

let backendProcess: ChildProcess | undefined

BeforeAll(async function () {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectDir = resolve(__dirname, '../..')
  const backendPort = new URL(config.apiUrl).port

  process.env.SCENARIO_ACTOR_SECRET ??= 'e2e-actor-secret'

  backendProcess = spawn(
    'npx',
    ['pikku', 'dev', '--port', backendPort, '--coverage', '--test'],
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

  // Wait for the backend to be ready AND for seeding to have finished. Seeding
  // (seedAuthUsers) runs in afterStart — async, AFTER the server starts
  // accepting requests — so a bare connectivity check races ahead of it and UI
  // sign-ins fail against not-yet-seeded users. Poll the seeded guest sign-in
  // instead (guest is created last of the seed users, so a 2xx proves the
  // server is up and seeding has finished; the admin role update runs
  // immediately after guest creation).
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: config.apiUrl,
        },
        body: JSON.stringify({
          email: GUEST_USER.email,
          password: GUEST_USER.password,
        }),
      })
      if (res.ok) return // server up and seed users present
    } catch {
      // server not accepting connections yet — keep polling
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Backend did not start / seed within 120 seconds on ${config.apiUrl}`
  )
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

Before('@console-staff', async function (this: AgentWorld) {
  await this.openBrowser()
  await this.login(STAFF_USER)
})

After('@console-staff', async function (this: AgentWorld) {
  await this.closeBrowser()
})
