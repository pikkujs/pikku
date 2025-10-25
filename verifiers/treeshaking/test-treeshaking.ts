import { execSync } from 'child_process'
import { readFileSync, existsSync, unlinkSync } from 'fs'
import { join } from 'path'
import { test } from 'node:test'
import * as assert from 'node:assert'
import { scenarios } from './test-scenarios.js'

const INSPECTOR_STATE_FILE = join(
  process.cwd(),
  '.pikku',
  'inspector-state.json'
)

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
    const servicesBlock = match[1]!
    const serviceMatches = servicesBlock.matchAll(/'([^']+)':\s*true/g)

    const services: string[] = []
    for (const serviceMatch of serviceMatches) {
      services.push(serviceMatch[1]!)
    }

    return services.sort()
  } catch (error) {
    console.error('Error parsing services file:', error)
    return []
  }
}

/**
 * Create the inspector state file once (inspect-once pattern)
 * This is called before running any test scenarios
 */
function createInspectorState(): void {
  try {
    // Run pikku all to create the inspector state file
    const command = `yarn pikku all --state-output=${INSPECTOR_STATE_FILE}`
    execSync(command, {
      cwd: process.cwd(),
      stdio: 'pipe', // Suppress output
    })
  } catch (error) {
    console.error('❌ Error creating inspector state:', error)
    throw error
  }
}

/**
 * Run pikku all with the given filter using the cached state (filter-many pattern)
 * This loads the pre-generated inspector state and applies the filter
 */
function runPikkuWithFilter(filter: string): string[] {
  try {
    // Run pikku all with the filter, loading from the cached state
    const command = filter
      ? `yarn pikku all --state-input=${INSPECTOR_STATE_FILE} ${filter}`
      : `yarn pikku all --state-input=${INSPECTOR_STATE_FILE}`

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

  // Create inspector state once (inspect-once pattern)
  createInspectorState()

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
  }

  // Cleanup: remove inspector state file
  if (existsSync(INSPECTOR_STATE_FILE)) {
    unlinkSync(INSPECTOR_STATE_FILE)
    console.log(`🧹 Cleaned up state file: ${INSPECTOR_STATE_FILE}\n`)
  }

  if (failed > 0) {
    process.exit(1)
  }
}

// Run the tests
runTests().catch((error) => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
