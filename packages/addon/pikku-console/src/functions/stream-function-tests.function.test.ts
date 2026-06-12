import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { streamFunctionTests } from './stream-function-tests.function.js'

function makeFakeCucumberScript(envelopes: unknown[]): string {
  const lines = envelopes.map(
    (e) => `process.stdout.write(${JSON.stringify(JSON.stringify(e))} + '\\n')`
  )
  return [...lines, 'process.exit(0)'].join('\n')
}

function makeFixture(envelopes: unknown[]): {
  dir: string
  cleanup: () => void
} {
  const dir = mkdtempSync(join(tmpdir(), 'pikku-sse-test-'))
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'tests', 'node_modules', '.bin'), { recursive: true })
  writeFileSync(
    join(dir, 'tests', 'node_modules', '.bin', 'c8'),
    makeFakeCucumberScript(envelopes)
  )
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function makeChannel() {
  const events: unknown[] = []
  return {
    events,
    channel: {
      send: (event: unknown) => {
        events.push(event)
      },
      close: () => {},
    },
  }
}

async function runStream(dir: string) {
  const { channel, events } = makeChannel()
  await streamFunctionTests.func(
    { metaService: { basePath: join(dir, 'src') } } as never,
    null,
    { channel } as never
  )
  return events as Array<Record<string, unknown>>
}

const PASSING_ENVELOPES = [
  {
    pickle: {
      id: 'p1',
      name: 'Create a todo',
      uri: 'features/todo.feature',
      steps: [
        { id: 's1', text: 'Given a user exists' },
        { id: 's2', text: 'When they create a todo' },
      ],
    },
  },
  {
    testCase: {
      id: 'tc1',
      pickleId: 'p1',
      testSteps: [
        { id: 'ts1', pickleStepId: 's1' },
        { id: 'ts2', pickleStepId: 's2' },
      ],
    },
  },
  { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1', attempt: 0 } },
  {
    testStepFinished: {
      testCaseStartedId: 'tcs1',
      testStepId: 'ts1',
      testStepResult: {
        status: 'PASSED',
        duration: { seconds: 0, nanos: 30_000_000 },
      },
    },
  },
  {
    testStepFinished: {
      testCaseStartedId: 'tcs1',
      testStepId: 'ts2',
      testStepResult: {
        status: 'PASSED',
        duration: { seconds: 0, nanos: 15_000_000 },
      },
    },
  },
  { testCaseFinished: { testCaseStartedId: 'tcs1', willBeRetried: false } },
  { testRunFinished: { success: true } },
]

const FAILING_ENVELOPES = [
  {
    pickle: {
      id: 'p1',
      name: 'Delete a todo',
      uri: 'features/todo.feature',
      steps: [
        { id: 's1', text: 'Given a todo exists' },
        { id: 's2', text: 'When they delete it' },
        { id: 's3', text: 'Then it is gone' },
      ],
    },
  },
  {
    testCase: {
      id: 'tc1',
      pickleId: 'p1',
      testSteps: [
        { id: 'ts1', pickleStepId: 's1' },
        { id: 'ts2', pickleStepId: 's2' },
        { id: 'ts3', pickleStepId: 's3' },
      ],
    },
  },
  { testCaseStarted: { id: 'tcs1', testCaseId: 'tc1', attempt: 0 } },
  {
    testStepFinished: {
      testCaseStartedId: 'tcs1',
      testStepId: 'ts1',
      testStepResult: {
        status: 'PASSED',
        duration: { seconds: 0, nanos: 10_000_000 },
      },
    },
  },
  {
    testStepFinished: {
      testCaseStartedId: 'tcs1',
      testStepId: 'ts2',
      testStepResult: {
        status: 'FAILED',
        duration: { seconds: 0, nanos: 5_000_000 },
        message: 'Expected true but got false',
      },
    },
  },
  {
    testStepFinished: {
      testCaseStartedId: 'tcs1',
      testStepId: 'ts3',
      testStepResult: { status: 'SKIPPED', duration: { seconds: 0, nanos: 0 } },
    },
  },
  { testCaseFinished: { testCaseStartedId: 'tcs1', willBeRetried: false } },
  { testRunFinished: { success: false } },
]

test('streamFunctionTests emits scenario-start for each scenario', async () => {
  const { dir, cleanup } = makeFixture(PASSING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const start = events.find((e) => e.type === 'scenario-start')
    assert.ok(start, 'expected a scenario-start event')
    assert.equal(start.id, 'tcs1')
    assert.equal(start.name, 'Create a todo')
    assert.equal(start.uri, 'features/todo.feature')
  } finally {
    cleanup()
  }
})

test('streamFunctionTests emits a step event for each completed step', async () => {
  const { dir, cleanup } = makeFixture(PASSING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const steps = events.filter((e) => e.type === 'step')
    assert.equal(steps.length, 2)

    const [first, second] = steps
    assert.equal(first.scenarioId, 'tcs1')
    assert.equal(first.step, 'Given a user exists')
    assert.equal(first.status, 'PASSED')
    assert.equal(first.duration, 30)

    assert.equal(second.step, 'When they create a todo')
    assert.equal(second.status, 'PASSED')
    assert.equal(second.duration, 15)
  } finally {
    cleanup()
  }
})

test('streamFunctionTests emits scenario-done with PASSED when all steps pass', async () => {
  const { dir, cleanup } = makeFixture(PASSING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const done = events.find((e) => e.type === 'scenario-done')
    assert.ok(done, 'expected a scenario-done event')
    assert.equal(done.id, 'tcs1')
    assert.equal(done.name, 'Create a todo')
    assert.equal(done.status, 'PASSED')
  } finally {
    cleanup()
  }
})

test('streamFunctionTests emits scenario-done with FAILED when any step fails', async () => {
  const { dir, cleanup } = makeFixture(FAILING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const done = events.find((e) => e.type === 'scenario-done')
    assert.ok(done, 'expected a scenario-done event')
    assert.equal(done.status, 'FAILED')
  } finally {
    cleanup()
  }
})

test('streamFunctionTests propagates the failure step message', async () => {
  const { dir, cleanup } = makeFixture(FAILING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const failedStep = events.find(
      (e) => e.type === 'step' && e.status === 'FAILED'
    ) as any
    assert.ok(failedStep, 'expected a failed step event')
    assert.equal(failedStep.step, 'When they delete it')
    assert.equal(failedStep.message, 'Expected true but got false')
  } finally {
    cleanup()
  }
})

test('streamFunctionTests emits done at the end with null coverage when no report exists', async () => {
  const { dir, cleanup } = makeFixture(PASSING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const finish = events.find((e) => e.type === 'done')
    assert.ok(finish, 'expected a done event')
    assert.equal(finish.coverage, null)
  } finally {
    cleanup()
  }
})

test('streamFunctionTests events arrive in the correct order', async () => {
  const { dir, cleanup } = makeFixture(PASSING_ENVELOPES)
  try {
    const events = await runStream(dir)
    const types = events.map((e) => e.type)
    const startIdx = types.indexOf('scenario-start')
    const firstStepIdx = types.indexOf('step')
    const doneIdx = types.indexOf('scenario-done')
    const finishIdx = types.indexOf('done')
    assert.ok(startIdx < firstStepIdx, 'scenario-start must come before steps')
    assert.ok(firstStepIdx < doneIdx, 'steps must come before scenario-done')
    assert.ok(doneIdx < finishIdx, 'scenario-done must come before done')
  } finally {
    cleanup()
  }
})
