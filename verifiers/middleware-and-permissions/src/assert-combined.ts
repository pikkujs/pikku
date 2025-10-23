/**
 * Expected event (middleware or permission) log entry
 */
export interface ExpectedEvent {
  name: string
  type: string
  phase?: string // For middleware: 'before' | 'after'. For permissions: undefined
}

/**
 * Actual event log entry
 */
export interface ActualEvent {
  name: string
  type: string
  phase?: string
  sessionExists?: boolean
}

/**
 * Asserts that both middleware and permission execution matches expected order
 * @param expected - Array of expected events (middleware + permissions) in order
 * @param fn - Function to execute that will trigger middleware and permissions
 * @param logger - Logger instance to check execution
 * @returns true if execution matches expected order, false otherwise
 */
export async function assertMiddlewareAndPermissions(
  expected: ExpectedEvent[],
  fn: () => Promise<void>,
  logger: any
): Promise<boolean> {
  console.log('\nExpected execution order:')
  expected.forEach((event, index) => {
    const phaseStr = event.phase ? ` [${event.phase}]` : ''
    console.log(`  ${index + 1}. ${event.name} (${event.type})${phaseStr}`)
  })

  logger.clear()
  await fn()

  console.log('\nActual execution order:')
  const logs = logger.getLogs()

  // Filter to only middleware 'before' events and all permission events
  const relevantEvents = logs.filter(
    (e: ActualEvent) =>
      e.phase === 'before' || // Middleware before phase
      (e.type && e.type.includes('permission') && !e.phase) // Permission events (no phase)
  )

  if (relevantEvents.length === 0) {
    console.log('  No middleware or permissions executed')
  } else {
    relevantEvents.forEach((event: ActualEvent, index: number) => {
      const phaseStr = event.phase ? ` [${event.phase}]` : ''
      console.log(`  ${index + 1}. ${event.name} (${event.type})${phaseStr}`)
    })
  }

  // Compare expected vs actual
  let matches = true
  if (expected.length !== relevantEvents.length) {
    console.log(
      `\nLength mismatch: expected ${expected.length}, got ${relevantEvents.length}`
    )
    matches = false
  } else {
    for (let i = 0; i < expected.length; i++) {
      const expectedItem = expected[i]
      const actualItem = relevantEvents[i]
      if (
        !expectedItem ||
        !actualItem ||
        expectedItem.name !== actualItem.name ||
        expectedItem.type !== actualItem.type ||
        (expectedItem.phase !== undefined &&
          expectedItem.phase !== actualItem.phase)
      ) {
        console.log(`\nMismatch at position ${i + 1}:`)
        console.log(
          `  Expected: ${expectedItem?.name} (${expectedItem?.type}) ${expectedItem?.phase || ''}`
        )
        console.log(
          `  Actual: ${actualItem?.name} (${actualItem?.type}) ${actualItem?.phase || ''}`
        )
        matches = false
        break
      }
    }
  }

  console.log(`\nMatches expected: ${matches}`)
  logger.clear()

  return matches
}
