/**
 * Expected middleware log entry
 */
export interface ExpectedMiddleware {
  name: string
  type: string
}

/**
 * Actual middleware log entry
 */
export interface ActualMiddleware {
  name: string
  type: string
  phase: string
}

/**
 * Asserts that middleware execution matches expected order
 * @param expected - Array of expected middleware in order
 * @param fn - Function to execute that will trigger middleware
 * @param logger - Logger instance to check execution
 * @returns true if middleware matches expected order, false otherwise
 */
export async function assertMiddleware(
  expected: ExpectedMiddleware[],
  fn: () => Promise<void>,
  logger: any
): Promise<boolean> {
  console.log('\nExpected middleware order:')
  expected.forEach((middleware, index) => {
    console.log(`  ${index + 1}. ${middleware.name} (${middleware.type})`)
  })

  logger.clear()
  await fn()

  console.log('\nActual middleware order:')
  const logs = logger.getLogs()
  const beforeEvents = logs.filter(
    (e: ActualMiddleware) => e.phase === 'before'
  )

  if (beforeEvents.length === 0) {
    console.log('  No middleware executed')
  } else {
    beforeEvents.forEach((event: ActualMiddleware, index: number) => {
      console.log(`  ${index + 1}. ${event.name} (${event.type})`)
    })
  }

  // Compare expected vs actual
  let matches = true
  if (expected.length !== beforeEvents.length) {
    matches = false
  } else {
    for (let i = 0; i < expected.length; i++) {
      const expectedItem = expected[i]
      const actualItem = beforeEvents[i]
      if (
        !expectedItem ||
        !actualItem ||
        expectedItem.name !== actualItem.name ||
        expectedItem.type !== actualItem.type
      ) {
        matches = false
        break
      }
    }
  }

  console.log(`\nExpected: ${matches}`)
  logger.clear()

  return matches
}
