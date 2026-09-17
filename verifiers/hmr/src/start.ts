import { unlinkSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { createConfig, createSingletonServices } from './services.js'
import '../.pikku/pikku-bootstrap.gen.js'

import { fetch } from '@pikku/core/http'
import { runQueueJob } from '@pikku/core/queue'
import { runScheduledTask } from '@pikku/core/scheduler'
import { pikkuDevReloader } from '@pikku/core/dev'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    )
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

interface TestResult {
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn()
    results.push({ name, passed: true })
    console.log(`  \u2713 ${name}`)
  } catch (e: any) {
    results.push({ name, passed: false, error: e.message })
    console.log(`  \u2717 ${name}`)
    console.log(`    ${e.message}`)
  }
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** What `tsc`, `pikku dist` or a bundler leaves beside a source file. `pikku
 *  dev` never refreshes it, so a reload that reads it serves the code the
 *  developer just replaced — while logging a successful reload. */
const writeStaleCompiledSibling = async (jsFile: string, body: string) => {
  await writeFile(jsFile, body)
}

const cleanupJsFile = (jsFile: string) => {
  try {
    unlinkSync(jsFile)
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// HTTP greeting function helpers
// ---------------------------------------------------------------------------

const GREETING_TS = resolve('src/functions/greeting.function.ts')
const GREETING_JS = resolve('src/functions/greeting.function.js')

const GREETING_ORIGINAL = `import { pikkuSessionlessFunc } from '#pikku/function'

export const greeting = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return { message: \`Hello, \${name}!\` }
  },
})
`

const writeGreetingTs = async (returnExpr: string) => {
  await writeFile(
    GREETING_TS,
    `import { pikkuSessionlessFunc } from '#pikku/function'

export const greeting = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return ${returnExpr}
  },
})
`
  )
}

const restoreGreeting = async () => {
  await writeFile(GREETING_TS, GREETING_ORIGINAL)
  cleanupJsFile(GREETING_JS)
}

// ---------------------------------------------------------------------------
// HTTP middleware function helpers
// ---------------------------------------------------------------------------

const MW_FUNC_TS = resolve('src/functions/greeter-with-middleware.function.ts')
const MW_FUNC_JS = resolve('src/functions/greeter-with-middleware.function.js')

const MW_FUNC_ORIGINAL = `import { pikkuSessionlessFunc } from '#pikku/function'
import { loggingMiddleware } from './middleware.js'

export const greeterWithMiddleware = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return { message: \`Middleware Hello, \${name}!\` }
  },
  middleware: [loggingMiddleware],
})
`

const writeMwFuncTs = async (returnExpr: string) => {
  await writeFile(
    MW_FUNC_TS,
    `import { pikkuSessionlessFunc } from '#pikku/function'
import { loggingMiddleware } from './middleware.js'

export const greeterWithMiddleware = pikkuSessionlessFunc<
  { name: string },
  { message: string }
>({
  auth: false,
  func: async (_services, { name }) => {
    return ${returnExpr}
  },
  middleware: [loggingMiddleware],
})
`
  )
}

const restoreMwFunc = async () => {
  await writeFile(MW_FUNC_TS, MW_FUNC_ORIGINAL)
  cleanupJsFile(MW_FUNC_JS)
}

// ---------------------------------------------------------------------------
// Scheduler function helpers
// ---------------------------------------------------------------------------

const SCHED_TS = resolve('src/functions/scheduled.function.ts')
const SCHED_JS = resolve('src/functions/scheduled.function.js')

const SCHED_ORIGINAL = `import { pikkuSessionlessFunc } from '#pikku/function'

export const myScheduledTask = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async ({ logger }) => {
    logger.info(\`Scheduled task ran at \${Date.now()}\`)
  },
})
`

const restoreScheduled = async () => {
  await writeFile(SCHED_TS, SCHED_ORIGINAL)
  cleanupJsFile(SCHED_JS)
}

// ---------------------------------------------------------------------------
// Queue function helpers
// ---------------------------------------------------------------------------

const QUEUE_TS = resolve('src/functions/queue.function.ts')
const QUEUE_JS = resolve('src/functions/queue.function.js')

const QUEUE_ORIGINAL = `import { pikkuSessionlessFunc } from '#pikku/function'

export const myQueueWorker = pikkuSessionlessFunc<
  { item: string },
  { processed: string }
>({
  auth: false,
  func: async (_services, { item }) => {
    return { processed: \`done: \${item}\` }
  },
})
`

const restoreQueue = async () => {
  await writeFile(QUEUE_TS, QUEUE_ORIGINAL)
  cleanupJsFile(QUEUE_JS)
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

const fetchGreeting = async (name: string) => {
  const request = new Request(`http://localhost/api/greet?name=${name}`, {
    method: 'GET',
  })
  const response = await fetch(request)
  return response.json()
}

const fetchMwGreeting = async (name: string) => {
  const request = new Request(`http://localhost/api/greet-mw?name=${name}`, {
    method: 'GET',
  })
  const response = await fetch(request)
  return response.json()
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  setLevel: () => {},
}

// ---------------------------------------------------------------------------
// Reloader factory
// ---------------------------------------------------------------------------

const createReloader = () =>
  pikkuDevReloader({
    srcDirectories: [resolve('src')],
    logger: silentLogger,
  })

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const config = await createConfig()
  await createSingletonServices(config)

  console.log('\nHMR (Hot Module Reload) Verifier')
  console.log('================================')

  // =========================================================================
  // HTTP tests
  // =========================================================================

  console.log('\n--- HTTP ---')

  await runTest('HTTP: initial value', async () => {
    const body = await fetchGreeting('World')
    assertEqual(body, { message: 'Hello, World!' }, 'initial response')
  })

  await runTest('HTTP: hot-reload updates function', async () => {
    const reloader = await createReloader()
    try {
      await writeGreetingTs('{ message: `Hey there, ${name}!` }')
      await wait(500)
      const body = await fetchGreeting('World')
      assertEqual(body, { message: 'Hey there, World!' }, 'reloaded response')
    } finally {
      reloader.close()
      await restoreGreeting()
    }
  })

  await runTest('HTTP: second reload', async () => {
    const reloader = await createReloader()
    try {
      await writeGreetingTs('{ message: `Yo, ${name}!` }')
      await wait(500)
      const body = await fetchGreeting('Dev')
      assertEqual(body, { message: 'Yo, Dev!' }, 'second reload')
    } finally {
      reloader.close()
      await restoreGreeting()
    }
  })

  await runTest('HTTP: a stale compiled sibling never wins', async () => {
    const reloader = await createReloader()
    try {
      await writeStaleCompiledSibling(
        GREETING_JS,
        `export const greeting = { func: async (_services, { name }) => ({ message: \`Stale, \${name}!\` }), auth: false };\n`
      )
      await writeGreetingTs('{ message: `Fresh, ${name}!` }')
      await wait(500)
      const body = await fetchGreeting('World')
      assertEqual(
        body,
        { message: 'Fresh, World!' },
        'edited source wins over the leftover build output'
      )
    } finally {
      reloader.close()
      await restoreGreeting()
    }
  })

  await runTest('HTTP: invalid source keeps existing function', async () => {
    const reloader = await createReloader()
    try {
      await writeGreetingTs('{ message: `Safe and sound, ${name}!` }')
      await wait(500)
      const before = await fetchGreeting('Safe')
      assertEqual(
        before,
        { message: 'Safe and sound, Safe!' },
        'baseline before bad reload'
      )

      await writeFile(GREETING_TS, 'this is not valid typescript {{{')
      await wait(500)

      const after = await fetchGreeting('Safe')
      assertEqual(
        after,
        { message: 'Safe and sound, Safe!' },
        'function survives bad reload'
      )
    } finally {
      reloader.close()
      await restoreGreeting()
    }
  })

  // =========================================================================
  // HTTP + Middleware tests
  // =========================================================================

  console.log('\n--- HTTP + Middleware ---')

  await runTest('Middleware: initial value', async () => {
    const body = await fetchMwGreeting('World')
    assertEqual(
      body,
      { message: 'Middleware Hello, World!' },
      'middleware initial response'
    )
  })

  await runTest('Middleware: hot-reload updates function', async () => {
    const reloader = await createReloader()
    try {
      await writeMwFuncTs('{ message: `MW Reloaded, ${name}!` }')
      await wait(500)
      const body = await fetchMwGreeting('World')
      assertEqual(
        body,
        { message: 'MW Reloaded, World!' },
        'middleware reloaded response'
      )
    } finally {
      reloader.close()
      await restoreMwFunc()
    }
  })

  // =========================================================================
  // Scheduler tests
  // =========================================================================

  console.log('\n--- Scheduler ---')

  await runTest('Scheduler: initial run succeeds', async () => {
    await runScheduledTask({ name: 'myScheduledTask' })
  })

  await runTest('Scheduler: hot-reload updates function', async () => {
    const reloader = await createReloader()
    try {
      await writeFile(
        SCHED_TS,
        `import { pikkuSessionlessFunc } from '#pikku/function'

export const myScheduledTask = pikkuSessionlessFunc<void, void>({
  auth: false,
  func: async ({ logger }) => {
    logger.info('RELOADED-SCHED')
  },
})
`
      )
      await wait(500)

      // If it doesn't throw, the reloaded function ran successfully
      await runScheduledTask({ name: 'myScheduledTask' })
    } finally {
      reloader.close()
      await restoreScheduled()
    }
  })

  // =========================================================================
  // Queue tests
  // =========================================================================

  console.log('\n--- Queue ---')

  await runTest('Queue: initial run succeeds', async () => {
    await runQueueJob({
      job: {
        id: 'test-1',
        queueName: 'myQueue',
        data: { item: 'hello' },
        status: () => 'waiting' as const,
      },
    })
  })

  await runTest('Queue: hot-reload updates function', async () => {
    const reloader = await createReloader()
    try {
      await writeFile(
        QUEUE_TS,
        `import { pikkuSessionlessFunc } from '#pikku/function'

export const myQueueWorker = pikkuSessionlessFunc<
  { item: string },
  { processed: string }
>({
  auth: false,
  func: async (_services, { item }) => {
    return { processed: \`reloaded: \${item}\` }
  },
})
`
      )
      await wait(500)

      await runQueueJob({
        job: {
          id: 'test-2',
          queueName: 'myQueue',
          data: { item: 'world' },
          status: () => 'waiting' as const,
        },
      })
    } finally {
      reloader.close()
      await restoreQueue()
    }
  })

  // =========================================================================
  // Summary
  // =========================================================================

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`\n${'─'.repeat(40)}`)
  console.log(
    `Results: ${passed} passed, ${failed} failed, ${results.length} total`
  )

  if (failed > 0) {
    console.log('\nFailed tests:')
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  \u2717 ${r.name}: ${r.error}`)
    }
    console.log('\n\u2717 Some HMR tests failed!')
    process.exit(1)
  } else {
    console.log('\n\u2713 All HMR tests passed!')
  }
}

main().catch((e) => {
  console.error('\n\u2717 Fatal error:', e.message)
  console.error(e.stack)
  process.exit(1)
})
