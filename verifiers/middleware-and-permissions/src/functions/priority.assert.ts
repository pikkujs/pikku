import { fetch } from '@pikku/core'

interface LogEvent {
  type: string
  name: string
  phase: string
}

/**
 * Test middleware priority ordering — verifies both before and after phases.
 * Before: highest runs first (outermost)
 * After: highest runs last (onion unwinding)
 */
export async function testPriorityWiring(
  singletonServices: any
): Promise<boolean> {
  console.log('\n\nTest: /priority-test (middleware priority ordering)')
  console.log('─────────────────────────')

  const logger = singletonServices.logger
  logger.clear()

  await fetch(new Request('http://localhost/priority-test'))

  const logs: LogEvent[] = logger.getLogs()

  // Filter to only priority middleware events (both before and after)
  const priorityEvents = logs.filter((e: LogEvent) => e.type === 'priority')

  console.log('\nPriority middleware execution order:')
  priorityEvents.forEach((event: LogEvent, index: number) => {
    console.log(`  ${index + 1}. ${event.name} [${event.phase}]`)
  })

  // Expected order:
  // Before: highest → high → medium → low → lowest (outermost to innermost)
  // After: lowest → low → medium → high → highest (innermost to outermost, onion unwinding)
  const expectedOrder: Array<{ name: string; phase: string }> = [
    { name: 'highest', phase: 'before' },
    { name: 'high', phase: 'before' },
    { name: 'medium', phase: 'before' },
    { name: 'low', phase: 'before' },
    { name: 'lowest', phase: 'before' },
    { name: 'lowest', phase: 'after' },
    { name: 'low', phase: 'after' },
    { name: 'medium', phase: 'after' },
    { name: 'high', phase: 'after' },
    { name: 'highest', phase: 'after' },
  ]

  console.log('\nExpected order:')
  expectedOrder.forEach((event, index) => {
    console.log(`  ${index + 1}. ${event.name} [${event.phase}]`)
  })

  let matches = true
  if (priorityEvents.length !== expectedOrder.length) {
    console.log(
      `\nLength mismatch: expected ${expectedOrder.length}, got ${priorityEvents.length}`
    )
    matches = false
  } else {
    for (let i = 0; i < expectedOrder.length; i++) {
      const expected = expectedOrder[i]
      const actual = priorityEvents[i]
      if (
        !expected ||
        !actual ||
        expected.name !== actual.name ||
        expected.phase !== actual.phase
      ) {
        console.log(`\nMismatch at position ${i + 1}:`)
        console.log(`  Expected: ${expected?.name} [${expected?.phase}]`)
        console.log(`  Actual: ${actual?.name} [${actual?.phase}]`)
        matches = false
        break
      }
    }
  }

  if (matches) {
    console.log('\n✓ Priority ordering test passed')
  } else {
    console.log('\n✗ Priority ordering test failed')
  }

  logger.clear()
  return matches
}
