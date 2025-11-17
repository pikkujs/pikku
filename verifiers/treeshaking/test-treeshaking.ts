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
 * Parse the pikku-services.gen.ts file to extract singleton and interaction services
 */
function parseGeneratedServices(): {
  singletonServices: string[]
  interactionServices: string[]
} {
  try {
    const servicesFilePath = join(
      process.cwd(),
      '.pikku',
      'pikku-services.gen.ts'
    )
    const content = readFileSync(servicesFilePath, 'utf-8')

    // Filter out system services (config, schema, variables, jwt are framework services)
    const systemServices = new Set(['config', 'schema', 'variables', 'jwt'])

    const singletonServices: string[] = []
    const interactionServices: string[] = []

    // Extract requiredSingletonServices
    const singletonMatch = content.match(
      /export const requiredSingletonServices = \{([^}]+)\} as const/
    )
    if (singletonMatch) {
      const servicesBlock = singletonMatch[1]!
      const serviceMatches = servicesBlock.matchAll(/'([^']+)':\s*true/g)
      for (const serviceMatch of serviceMatches) {
        const serviceName = serviceMatch[1]!
        if (!systemServices.has(serviceName)) {
          singletonServices.push(serviceName)
        }
      }
    }

    // Extract requiredInteractionServices
    const sessionMatch = content.match(
      /export const requiredInteractionServices = \{([^}]+)\} as const/
    )
    if (sessionMatch) {
      const servicesBlock = sessionMatch[1]!
      const serviceMatches = servicesBlock.matchAll(/'([^']+)':\s*true/g)
      for (const serviceMatch of serviceMatches) {
        const serviceName = serviceMatch[1]!
        if (!systemServices.has(serviceName)) {
          interactionServices.push(serviceName)
        }
      }
    }

    return {
      singletonServices: singletonServices.sort(),
      interactionServices: interactionServices.sort(),
    }
  } catch (error) {
    console.error('Error parsing services file:', error)
    return { singletonServices: [], interactionServices: [] }
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
function runPikkuWithFilter(filter: string): {
  singletonServices: string[]
  interactionServices: string[]
} {
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
    expectedSingleton: string[]
    actualSingleton: string[]
    missingSingleton: string[]
    extraSingleton: string[]
    expectedSession: string[]
    actualSession: string[]
    missingSession: string[]
    extraSession: string[]
  }> = []

  for (const scenario of scenarios) {
    await test(scenario.name, () => {
      console.log(`\n📋 ${scenario.name}`)
      console.log(`   Filter: ${scenario.filter || '(none)'}`)
      console.log(
        `   Expected Singleton: [${scenario.expectedSingletonServices.join(', ')}]`
      )
      console.log(
        `   Expected Session:   [${scenario.expectedInteractionServices.join(', ')}]`
      )

      const actualServices = runPikkuWithFilter(scenario.filter)
      console.log(
        `   Actual Singleton:   [${actualServices.singletonServices.join(', ')}]`
      )
      console.log(
        `   Actual Session:     [${actualServices.interactionServices.join(', ')}]`
      )

      const singletonComparison = compareServices(
        actualServices.singletonServices,
        scenario.expectedSingletonServices
      )

      const sessionComparison = compareServices(
        actualServices.interactionServices,
        scenario.expectedInteractionServices
      )

      const bothMatch = singletonComparison.match && sessionComparison.match

      if (bothMatch) {
        console.log(`   ✅ PASS`)
        passed++
      } else {
        console.log(`   ❌ FAIL`)
        if (!singletonComparison.match) {
          if (singletonComparison.missing.length > 0) {
            console.log(
              `   Singleton Missing: [${singletonComparison.missing.join(', ')}]`
            )
          }
          if (singletonComparison.extra.length > 0) {
            console.log(
              `   Singleton Extra:   [${singletonComparison.extra.join(', ')}]`
            )
          }
        }
        if (!sessionComparison.match) {
          if (sessionComparison.missing.length > 0) {
            console.log(
              `   Session Missing:   [${sessionComparison.missing.join(', ')}]`
            )
          }
          if (sessionComparison.extra.length > 0) {
            console.log(
              `   Session Extra:     [${sessionComparison.extra.join(', ')}]`
            )
          }
        }
        failed++
        failures.push({
          scenario: scenario.name,
          expectedSingleton: scenario.expectedSingletonServices,
          actualSingleton: actualServices.singletonServices,
          missingSingleton: singletonComparison.missing,
          extraSingleton: singletonComparison.extra,
          expectedSession: scenario.expectedInteractionServices,
          actualSession: actualServices.interactionServices,
          missingSession: sessionComparison.missing,
          extraSession: sessionComparison.extra,
        })
      }

      assert.deepStrictEqual(
        actualServices.singletonServices,
        scenario.expectedSingletonServices,
        `Singleton services mismatch for scenario: ${scenario.name}\n` +
          `Expected: [${scenario.expectedSingletonServices.join(', ')}]\n` +
          `Actual:   [${actualServices.singletonServices.join(', ')}]`
      )

      assert.deepStrictEqual(
        actualServices.interactionServices,
        scenario.expectedInteractionServices,
        `Interaction services mismatch for scenario: ${scenario.name}\n` +
          `Expected: [${scenario.expectedInteractionServices.join(', ')}]\n` +
          `Actual:   [${actualServices.interactionServices.join(', ')}]`
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
      console.log(
        `    Expected Singleton: [${failure.expectedSingleton.join(', ')}]`
      )
      console.log(
        `    Actual Singleton:   [${failure.actualSingleton.join(', ')}]`
      )
      if (failure.missingSingleton.length > 0) {
        console.log(
          `    Singleton Missing:  [${failure.missingSingleton.join(', ')}]`
        )
      }
      if (failure.extraSingleton.length > 0) {
        console.log(
          `    Singleton Extra:    [${failure.extraSingleton.join(', ')}]`
        )
      }
      console.log(
        `    Expected Session:   [${failure.expectedSession.join(', ')}]`
      )
      console.log(
        `    Actual Session:     [${failure.actualSession.join(', ')}]`
      )
      if (failure.missingSession.length > 0) {
        console.log(
          `    Session Missing:    [${failure.missingSession.join(', ')}]`
        )
      }
      if (failure.extraSession.length > 0) {
        console.log(
          `    Session Extra:      [${failure.extraSession.join(', ')}]`
        )
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
