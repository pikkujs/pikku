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
import { ADMIN_USER } from '../../src/auth-fixtures.js'
import { assertPortFree } from './backend-port.js'

// LLM calls can be slow
setDefaultTimeout(config.responseTimeout)

let backendProcess: ChildProcess | undefined

BeforeAll(async function () {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const projectDir = resolve(__dirname, '../..')
  const backendPort = new URL(config.apiUrl).port

  await assertPortFree(Number(backendPort), new URL(config.apiUrl).hostname)

  process.env.SCENARIO_ACTOR_SECRET ??= 'e2e-actor-secret'

  // The deterministic agent suite scripts the model instead of calling OpenAI.
  // Opt out with PIKKU_MOCK_LLM=0 to run the @ai-live tier against a real key.
  process.env.PIKKU_MOCK_LLM ??= '1'

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
  // (seedAuthUsers, then seedScopes) runs in afterStart — async, AFTER the
  // server starts accepting requests — so a bare connectivity check races ahead
  // of it and UI sign-ins fail against not-yet-seeded users. Poll the seeded
  // admin all the way through a console RPC instead: a non-403 proves both that
  // the user rows exist and that seedScopes has granted the `admin` scope the
  // console's global gate checks, which is the very last thing seeding does.
  // A backend that dies on startup would otherwise burn the whole 120s window
  // before reporting, and the reason would already have scrolled past.
  let exitCode: number | null | undefined
  backendProcess.on('exit', (code) => {
    exitCode = code
  })

  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (exitCode !== undefined) {
      throw new Error(
        `Backend exited with code ${exitCode} before it was ready`
      )
    }
    try {
      const res = await fetch(`${config.apiUrl}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: config.apiUrl,
        },
        body: JSON.stringify({
          email: ADMIN_USER.email,
          password: ADMIN_USER.password,
        }),
      })
      const cookie = res.headers.get('set-cookie')
      if (res.ok && cookie) {
        const ping = await fetch(`${config.apiUrl}/rpc/console:ping`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', cookie },
          body: JSON.stringify({ data: {} }),
        })
        if (ping.status !== 403) return // server up, users seeded, scopes granted
      }
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
    // A rendered assistant bubble must never be empty. Only assert on
    // scenarios that otherwise passed so this never masks an unrelated
    // failure, and close the browser before throwing so it never leaks.
    let emptyAssistantError: string | undefined
    if (result?.status === 'PASSED') {
      try {
        const blocks = this.page.locator('[data-testid="assistant-block"]')
        const count = await blocks.count()
        for (let i = 0; i < count; i++) {
          const text = (await blocks.nth(i).innerText()).trim()
          if (text === '') {
            emptyAssistantError = `Assistant message #${i + 1} of ${count} rendered empty — assistant replies must never be blank`
            break
          }
        }
      } catch {
        // Page may already be gone; skip the check rather than fail teardown
      }
    }
    const headed = process.env.HEADED === '1' || process.env.HEADED === 'true'
    if (headed) {
      console.log('[headed] Pausing for 10 seconds before closing browser...')
      await new Promise((r) => setTimeout(r, 10_000))
    }
    await this.closeBrowser()
    if (emptyAssistantError) {
      throw new Error(emptyAssistantError)
    }
  }
)

Before('@agent-protocol', async function (this: AgentWorld) {
  this.threadId = randomUUID()
  await fetch(`${config.apiUrl}/rpc/resetLlmLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
})

Before('@console-staff', async function (this: AgentWorld) {
  await this.openBrowser()
  await this.login(STAFF_USER)
})

After('@console-staff', async function (this: AgentWorld) {
  await this.closeBrowser()
})
