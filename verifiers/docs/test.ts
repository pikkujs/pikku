import { readFile } from 'fs/promises'
import { join } from 'path'
import type { FunctionsMeta } from '@pikku/core'

async function loadJSON<T>(path: string): Promise<T> {
  const content = await readFile(join(process.cwd(), path), 'utf-8')
  return JSON.parse(content) as T
}

async function main(): Promise<void> {
  console.log('\nJSDoc Metadata Extraction Verification')
  console.log('======================================\n')

  // Load metadata files in parallel (from templates/functions since we extend that config)
  const [functionsMeta] = await Promise.all([
    loadJSON<FunctionsMeta>(
      '../../templates/functions/.pikku/function/pikku-functions-meta.verbose.gen.json'
    ),
  ])

  // Define test assertions: function name -> [actual, expected]
  const assertions: Record<string, Array<[any, any, string]>> = {
    'Channel Functions': [
      [
        functionsMeta.onConnect?.summary,
        'Handle channel connection',
        'onConnect has summary from JSDoc',
      ],
      [
        functionsMeta.onConnect?.description,
        'Executed when a client connects to the WebSocket channel, logs connection info and sends welcome message',
        'onConnect has description from JSDoc',
      ],
      [
        functionsMeta.onDisconnect?.summary,
        'Handle channel disconnection',
        'onDisconnect has summary from JSDoc',
      ],
      [
        functionsMeta.authenticate?.summary,
        'Authenticate user session',
        'authenticate has summary from JSDoc',
      ],
    ],
    'Scheduler Functions': [
      [
        functionsMeta.myScheduledTask?.summary,
        'Periodic logging task',
        'myScheduledTask has summary from JSDoc',
      ],
    ],
    'HTTP Functions': [
      [
        functionsMeta.welcomeToPikku?.summary,
        'Welcome endpoint for new users',
        'welcomeToPikku has summary from JSDoc',
      ],
      [
        functionsMeta.helloWorld?.summary,
        'Simple hello world endpoint',
        'helloWorld has summary from JSDoc',
      ],
    ],
    'Queue Worker Functions': [
      [
        functionsMeta.queueWorker?.summary,
        'Process queue job with optional failure',
        'queueWorker has summary from JSDoc',
      ],
      [
        functionsMeta.queueWorkerWithMiddleware?.summary,
        'Process queue job with middleware',
        'queueWorkerWithMiddleware has summary from JSDoc',
      ],
    ],
    'MCP Functions': [
      [
        functionsMeta.sayHello?.summary,
        'Greet user via MCP',
        'sayHello has summary from JSDoc',
      ],
      [
        functionsMeta.sayHello?.description,
        'Simple hello world MCP tool that returns a personalized greeting message',
        'sayHello has description from JSDoc',
      ],
      [
        functionsMeta.calculate?.summary,
        'Perform mathematical calculation',
        'calculate has summary from JSDoc',
      ],
      [
        functionsMeta.getStaticResource?.summary,
        'Get static resource data',
        'getStaticResource has summary from JSDoc',
      ],
      [
        functionsMeta.getUserInfo?.summary,
        'Retrieve user information',
        'getUserInfo has summary from JSDoc',
      ],
      [
        functionsMeta.staticPromptGenerator?.summary,
        'Generate static prompt',
        'staticPromptGenerator has summary from JSDoc',
      ],
      [
        functionsMeta.dynamicPromptGenerator?.summary,
        'Generate dynamic prompt by topic',
        'dynamicPromptGenerator has summary from JSDoc',
      ],
    ],
    'CLI Functions': [
      [
        functionsMeta.greetUser?.summary,
        'Greet user by name',
        'greetUser has summary from JSDoc',
      ],
      [
        functionsMeta.addNumbers?.summary,
        'Add two numbers',
        'addNumbers has summary from JSDoc',
      ],
    ],
    'Workflow Functions': [
      [
        functionsMeta.flakyHappyRPC?.summary,
        'Flaky RPC for retry testing (happy path)',
        'flakyHappyRPC has summary from JSDoc',
      ],
      [
        functionsMeta.alwaysFailsRPC?.summary,
        'Always-failing RPC for retry testing (unhappy path)',
        'alwaysFailsRPC has summary from JSDoc',
      ],
    ],
  }

  // Run assertions
  let totalPassed = 0
  let totalFailed = 0

  for (const [category, tests] of Object.entries(assertions)) {
    console.log(`\n${category}`)
    console.log('-'.repeat(category.length))

    for (const [actual, expected, message] of tests) {
      const passed = actual === expected
      if (passed) {
        console.log(`✓ ${message}`)
        totalPassed++
      } else {
        console.log(`✗ ${message}`)
        console.log(`  Expected: ${JSON.stringify(expected)}`)
        console.log(`  Actual: ${JSON.stringify(actual)}`)
        totalFailed++
      }
    }
  }

  // Summary
  console.log('\n\nTest Summary')
  console.log('============')
  console.log(
    `${totalPassed} passed, ${totalFailed} failed out of ${totalPassed + totalFailed} tests\n`
  )

  if (totalFailed > 0) {
    process.exit(1)
  }

  console.log('✓ All JSDoc metadata extraction tests passed!\n')
}

main().catch((error) => {
  console.error('\n✗ Test execution failed:', error)
  process.exit(1)
})
