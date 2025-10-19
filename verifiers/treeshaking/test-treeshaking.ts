import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { test } from 'node:test'
import * as assert from 'node:assert'

interface TestScenario {
  name: string
  filter: string
  expectedServices: string[]
  description: string
}

const scenarios: TestScenario[] = [
  // Baseline
  {
    name: 'Baseline (no filters)',
    filter: '',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description: 'All services should be included when no filters are applied',
  },

  // Single tag filters
  {
    name: 'Tag: notifications',
    filter: '--tags=notifications',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'Email, sms, logger (middleware), and session services should be included',
  },
  {
    name: 'Tag: email',
    filter: '--tags=email',
    expectedServices: ['email', 'logger'],
    description:
      'Email (function + permissions), logger (middleware), and session services',
  },
  {
    name: 'Tag: sms',
    filter: '--tags=sms',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'SMS (function), logger (middleware), and session services (email, logger)',
  },
  {
    name: 'Tag: payments',
    filter: '--tags=payments',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Payment route uses payment + analytics (function + middleware) + logger + storage (middleware) + session services',
  },
  {
    name: 'Tag: storage',
    filter: '--tags=storage',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Storage (function) and session services (email, logger)',
  },

  // Multiple tag filters (OR logic)
  {
    name: 'Tags: notifications,payments',
    filter: '--tags=notifications,payments',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description: 'All notification routes + payment route + session services',
  },
  {
    name: 'Tags: email,sms',
    filter: '--tags=email,sms',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Both email and SMS routes + session services',
  },
  {
    name: 'Tags: notifications,storage',
    filter: '--tags=notifications,storage',
    expectedServices: ['email', 'logger', 'sms', 'storage'],
    description: 'All notification + storage routes + session services',
  },

  // Type filters
  {
    name: 'Type: http',
    filter: '--types=http',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all wirings are HTTP) + session services',
  },

  // HTTP method filters
  {
    name: 'HTTP Method: POST',
    filter: '--httpMethods=POST',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all routes are POST) + session services',
  },
  {
    name: 'HTTP Method: GET',
    filter: '--httpMethods=GET',
    expectedServices: ['email', 'logger'],
    description: 'No GET routes exist, only session services',
  },

  // HTTP route filters
  {
    name: 'HTTP Route: /api/notifications/*',
    filter: '--httpRoutes=/api/notifications/*',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Only notification routes + session services',
  },
  {
    name: 'HTTP Route: /api/payments/*',
    filter: '--httpRoutes=/api/payments/*',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description: 'Only payment routes + session services',
  },
  {
    name: 'HTTP Route: /api/storage/*',
    filter: '--httpRoutes=/api/storage/*',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Only storage routes + session services',
  },

  // Directory filters
  {
    name: 'Directory: src/functions',
    filter: '--directories=src/functions',
    expectedServices: [
      'analytics',
      'email',
      'logger',
      'payment',
      'sms',
      'storage',
    ],
    description:
      'All services should be included (all wirings are in src/functions) + session services',
  },
  {
    name: 'Directory: src/nonexistent',
    filter: '--directories=src/nonexistent',
    expectedServices: ['email', 'logger'],
    description: 'No wirings in nonexistent directory, only session services',
  },

  // Combination filters
  {
    name: 'Combo: notifications + POST',
    filter: '--tags=notifications --httpMethods=POST',
    expectedServices: ['email', 'logger', 'sms'],
    description: 'Notification routes that are POST + session services',
  },
  {
    name: 'Combo: payments + http',
    filter: '--tags=payments --types=http',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description: 'Payment HTTP routes + session services',
  },

  // Wildcard name filters
  {
    name: 'Name: send*',
    filter: '--names=send*',
    expectedServices: ['email', 'logger', 'sms'],
    description:
      'Routes using sendEmail and sendSMS functions + middleware + session services',
  },
  {
    name: 'Name: process*',
    filter: '--names=process*',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Routes using processPayment function + middleware + session services',
  },
  {
    name: 'Name: *Payment',
    filter: '--names=*Payment',
    expectedServices: ['analytics', 'email', 'logger', 'payment', 'storage'],
    description:
      'Routes using functions ending with "Payment" + middleware + session services',
  },
  {
    name: 'Name: saveData',
    filter: '--names=saveData',
    expectedServices: ['email', 'logger', 'storage'],
    description: 'Routes using saveData function + session services',
  },
]

/**
 * Parse the pikku-services.gen.ts file to extract the list of services
 */
function parseGeneratedServices(): string[] {
  try {
    const servicesFilePath = join(
      process.cwd(),
      '.pikku',
      'pikku-services.gen.ts'
    )
    const content = readFileSync(servicesFilePath, 'utf-8')

    // Extract the singletonServices object
    const match = content.match(
      /export const singletonServices = \{([^}]+)\} as const/
    )
    if (!match) {
      return []
    }

    // Parse the service names from the object
    const servicesBlock = match[1]
    const serviceMatches = servicesBlock.matchAll(/'([^']+)':\s*true/g)

    const services: string[] = []
    for (const serviceMatch of serviceMatches) {
      services.push(serviceMatch[1])
    }

    return services.sort()
  } catch (error) {
    console.error('Error parsing services file:', error)
    return []
  }
}

/**
 * Run pikku all with the given filter and return the generated services
 */
function runPikkuWithFilter(filter: string): string[] {
  try {
    // Run pikku all with the filter
    const command = filter ? `npx pikku all ${filter}` : `npx pikku all`
    execSync(command, {
      cwd: process.cwd(),
      stdio: 'pipe', // Suppress output
    })

    // Parse and return the generated services
    return parseGeneratedServices()
  } catch (error) {
    console.error(`Error running pikku with filter "${filter}":`, error)
    throw error
  }
}

/**
 * Compare two service arrays
 */
function compareServices(
  actual: string[],
  expected: string[]
): { match: boolean; missing: string[]; extra: string[] } {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)

  const missing = expected.filter((s) => !actualSet.has(s))
  const extra = actual.filter((s) => !expectedSet.has(s))

  return {
    match: missing.length === 0 && extra.length === 0,
    missing,
    extra,
  }
}

/**
 * Run all test scenarios
 */
async function runTests() {
  console.log('\n🧪 Running Tree-Shaking Test Suite\n')
  console.log('='.repeat(80))

  let passed = 0
  let failed = 0
  const failures: Array<{
    scenario: string
    expected: string[]
    actual: string[]
    missing: string[]
    extra: string[]
  }> = []

  for (const scenario of scenarios) {
    await test(scenario.name, () => {
      console.log(`\n📋 ${scenario.name}`)
      console.log(`   Filter: ${scenario.filter || '(none)'}`)
      console.log(`   Expected: [${scenario.expectedServices.join(', ')}]`)

      const actualServices = runPikkuWithFilter(scenario.filter)
      console.log(`   Actual:   [${actualServices.join(', ')}]`)

      const comparison = compareServices(
        actualServices,
        scenario.expectedServices
      )

      if (comparison.match) {
        console.log(`   ✅ PASS`)
        passed++
      } else {
        console.log(`   ❌ FAIL`)
        if (comparison.missing.length > 0) {
          console.log(`   Missing: [${comparison.missing.join(', ')}]`)
        }
        if (comparison.extra.length > 0) {
          console.log(`   Extra:   [${comparison.extra.join(', ')}]`)
        }
        failed++
        failures.push({
          scenario: scenario.name,
          expected: scenario.expectedServices,
          actual: actualServices,
          missing: comparison.missing,
          extra: comparison.extra,
        })
      }

      assert.deepStrictEqual(
        actualServices,
        scenario.expectedServices,
        `Services mismatch for scenario: ${scenario.name}\n` +
          `Expected: [${scenario.expectedServices.join(', ')}]\n` +
          `Actual:   [${actualServices.join(', ')}]`
      )
    })
  }

  // Print summary
  console.log('\n' + '='.repeat(80))
  console.log('\n📊 Test Summary\n')
  console.log(`Total Scenarios: ${scenarios.length}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)

  if (failures.length > 0) {
    console.log('\n❌ Failed Scenarios:\n')
    failures.forEach((failure) => {
      console.log(`  • ${failure.scenario}`)
      console.log(`    Expected: [${failure.expected.join(', ')}]`)
      console.log(`    Actual:   [${failure.actual.join(', ')}]`)
      if (failure.missing.length > 0) {
        console.log(`    Missing:  [${failure.missing.join(', ')}]`)
      }
      if (failure.extra.length > 0) {
        console.log(`    Extra:    [${failure.extra.join(', ')}]`)
      }
      console.log()
    })
  }

  if (failed === 0) {
    console.log('\n🎉 All tests passed!\n')
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed\n`)
    process.exit(1)
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
