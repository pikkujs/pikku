import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { streamWorkflowRunStatus } from './workflow-status-stream.js'
import type { WorkflowRunService } from './workflow.types.js'

const run = (over: Record<string, unknown> = {}) =>
  ({
    id: 'run-1',
    workflow: 'checkout',
    status: 'running',
    input: {},
    wire: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as any

const step = (stepName: string, status: string, over: any = {}) =>
  ({ stepId: stepName, stepName, status, attemptCount: 1, ...over }) as any

/**
 * Each poll is driven by a scripted sequence rather than a clock, so a test
 * asserts what the stream sends without waiting for one.
 */
const harness = (
  polls: Array<{ run: any; steps: any[] }>,
  { detailed = false, session = undefined as any } = {}
) => {
  const sent: any[] = []
  let closed = false
  let index = 0
  const workflowRunService = {
    getRun: async () => {
      const frame = polls[Math.min(index, polls.length - 1)]
      return frame!.run
    },
    getRunSteps: async () => {
      const frame = polls[Math.min(index, polls.length - 1)]
      index += 1
      return frame!.steps
    },
  } as unknown as WorkflowRunService

  return {
    sent,
    closed: () => closed,
    stream: () =>
      streamWorkflowRunStatus({
        workflowRunService,
        runId: 'run-1',
        channel: {
          send: async (data: any) => {
            sent.push(data)
          },
          close: async () => {
            closed = true
          },
        },
        session,
        detailed,
        pollIntervalMs: 1,
      }),
  }
}

describe('streamWorkflowRunStatus', () => {
  test('a run that is already finished never starts a timer', async () => {
    const h = harness([
      { run: run({ status: 'completed' }), steps: [step('a', 'succeeded')] },
    ])
    await h.stream()
    assert.deepEqual(
      h.sent.map((frame) => frame.type),
      ['update', 'done']
    )
    assert.equal(h.closed(), true)
  })

  test('a run nobody can find closes the stream rather than hanging', async () => {
    const h = harness([{ run: null, steps: [] }])
    await h.stream()
    assert.equal(h.sent.length, 0)
    assert.equal(h.closed(), true)
  })

  // Checked on every poll, not just the first: a stream that outlives a session
  // should stop rather than keep reporting.
  test('a run belonging to someone else is refused', async () => {
    const h = harness(
      [{ run: run({ wire: { pikkuUserId: 'someone-else' } }), steps: [] }],
      { session: { userId: 'me' } }
    )
    await assert.rejects(
      h.stream(),
      /Not authorized to access this workflow run/
    )
  })

  // A deterministic run knows its whole shape up front, so the client can draw
  // every step — including the ones not started — before anything runs.
  test('a deterministic run sends its planned shape first', async () => {
    const h = harness([
      {
        run: run({
          status: 'completed',
          deterministic: true,
          plannedSteps: [{ stepName: 'a' }, { stepName: 'b' }],
        }),
        steps: [step('a', 'succeeded')],
      },
    ])
    await h.stream()
    const init = h.sent[0]
    assert.equal(init.type, 'init')
    assert.equal(init.deterministic, true)
    assert.deepEqual(init.steps, [
      { stepName: 'a', status: 'succeeded' },
      // Planned but not started, which is the whole reason to send this frame.
      { stepName: 'b', status: 'pending' },
    ])
  })

  test('a dynamic run has no shape to announce, so it announces none', async () => {
    const h = harness([
      { run: run({ status: 'completed' }), steps: [step('a', 'succeeded')] },
    ])
    await h.stream()
    assert.equal(
      h.sent.some((frame) => frame.type === 'init'),
      false
    )
  })

  // A run sitting on a slow step should cost one message, not one per poll.
  test('nothing is sent while nothing has changed', async () => {
    const h = harness([
      { run: run(), steps: [step('a', 'running')] },
      { run: run(), steps: [step('a', 'running')] },
      { run: run(), steps: [step('a', 'running')] },
      {
        run: run({ status: 'completed' }),
        steps: [step('a', 'succeeded')],
      },
    ])
    await h.stream()
    assert.deepEqual(
      h.sent.map((frame) => frame.type),
      ['update', 'update', 'done']
    )
  })

  test('every terminal status ends the stream', async () => {
    for (const status of ['completed', 'failed', 'cancelled']) {
      const h = harness([{ run: run({ status }), steps: [] }])
      await h.stream()
      assert.equal(h.sent.at(-1)!.type, 'done', status)
      assert.equal(h.closed(), true, status)
    }
  })

  // The whole difference between the two scaffolded routes. A workflow's output
  // and its error messages are internal detail, and a step that spawned a child
  // run says so only to tooling that can follow it.
  test('the user-facing stream reports progress and nothing else', async () => {
    const h = harness([
      {
        run: run({
          status: 'failed',
          output: { card: '4242' },
          error: { message: 'declined at acquirer', name: 'Error' },
        }),
        steps: [step('a', 'failed', { childRunId: 'child-1' })],
      },
    ])
    await h.stream()
    const update = h.sent[0]
    assert.equal(update.status, 'failed')
    assert.equal('output' in update, false)
    assert.equal('error' in update, false)
    assert.deepEqual(update.steps, [{ stepName: 'a', status: 'failed' }])
  })

  test('the detailed stream carries what the run produced', async () => {
    const h = harness(
      [
        {
          run: run({
            status: 'failed',
            output: { card: '4242' },
            error: { message: 'declined at acquirer', name: 'Error' },
          }),
          steps: [step('a', 'failed', { childRunId: 'child-1' })],
        },
      ],
      { detailed: true }
    )
    await h.stream()
    const update = h.sent[0]
    assert.deepEqual(update.output, { card: '4242' })
    assert.equal(update.error.message, 'declined at acquirer')
    assert.deepEqual(update.steps, [
      { stepName: 'a', status: 'failed', childRunId: 'child-1' },
    ])
  })

  // The detailed stream compares output too, so a run whose steps are unchanged
  // but whose output has moved on still reports it.
  test('a change only the detailed stream can see still reaches it', async () => {
    const frames = [
      { run: run({ output: { progress: 1 } }), steps: [step('a', 'running')] },
      { run: run({ output: { progress: 2 } }), steps: [step('a', 'running')] },
      {
        run: run({ status: 'completed', output: { progress: 2 } }),
        steps: [step('a', 'succeeded')],
      },
    ]
    const quiet = harness(frames)
    await quiet.stream()
    assert.equal(
      quiet.sent.filter((frame) => frame.type === 'update').length,
      2
    )

    const loud = harness(frames, { detailed: true })
    await loud.stream()
    assert.equal(loud.sent.filter((frame) => frame.type === 'update').length, 3)
  })

  // Without this the throw is an unhandled rejection from a timer callback,
  // which takes the process with it rather than failing the request.
  test('a poll that throws after the first stops the stream, loudly', async () => {
    let calls = 0
    await assert.rejects(
      streamWorkflowRunStatus({
        workflowRunService: {
          getRun: async () => {
            calls += 1
            if (calls > 1) {
              throw new Error('the database went away')
            }
            return run()
          },
          getRunSteps: async () => [],
        } as unknown as WorkflowRunService,
        runId: 'run-1',
        channel: { send: async () => {}, close: async () => {} },
        session: undefined,
        pollIntervalMs: 1,
      }),
      /the database went away/
    )
  })
})

/**
 * A stream that throws still has a channel open on the other end. The owner
 * check runs on every poll precisely so a session that loses access stops the
 * stream — which is only true if stopping also closes it.
 */
describe('streamWorkflowRunStatus closes the channel when a poll throws', () => {
  const failingStream = (failOn: number) => {
    let closed = false
    let polls = 0
    const workflowRunService = {
      getRun: async () => {
        polls += 1
        if (polls >= failOn) {
          throw new Error('run store unavailable')
        }
        return run()
      },
      getRunSteps: async () => [step('charge', 'running')],
    } as unknown as WorkflowRunService

    return {
      closed: () => closed,
      stream: () =>
        streamWorkflowRunStatus({
          workflowRunService,
          runId: 'run-1',
          channel: {
            send: async () => {},
            close: async () => {
              closed = true
            },
          },
          session: undefined as any,
          pollIntervalMs: 1,
        }),
    }
  }

  test('the first poll throwing closes the channel and rethrows', async () => {
    const h = failingStream(1)
    await assert.rejects(h.stream(), /run store unavailable/)
    assert.equal(h.closed(), true, 'a throw must not leave the channel open')
  })

  test('a later poll throwing closes the channel and rethrows', async () => {
    const h = failingStream(3)
    await assert.rejects(h.stream(), /run store unavailable/)
    assert.equal(h.closed(), true, 'a throw must not leave the channel open')
  })
})

/**
 * The poll used to be on a fixed interval, which fires whether or not the
 * previous one has come back. Two in flight at once both see `initSent` unset
 * and send the init frame twice.
 */
describe('streamWorkflowRunStatus never runs two polls at once', () => {
  test('a poll slower than the interval does not overlap the next', async () => {
    const sent: any[] = []
    let inFlight = 0
    let overlapped = false
    let polls = 0

    const workflowRunService = {
      getRun: async () => {
        inFlight += 1
        if (inFlight > 1) overlapped = true
        await new Promise((r) => setTimeout(r, 15))
        polls += 1
        inFlight -= 1
        return run({
          status: polls >= 3 ? 'completed' : 'running',
          deterministic: true,
          plannedSteps: [{ stepName: 'charge' }],
        })
      },
      getRunSteps: async () => [step('charge', 'running')],
    } as unknown as WorkflowRunService

    await streamWorkflowRunStatus({
      workflowRunService,
      runId: 'run-1',
      channel: {
        send: async (d: any) => {
          sent.push(d)
        },
        close: async () => {},
      },
      session: undefined as any,
      pollIntervalMs: 1,
    })

    assert.equal(overlapped, false, 'two polls must never be in flight together')
    assert.equal(
      sent.filter((f) => f.type === 'init').length,
      1,
      'the init frame is sent exactly once'
    )
  })
})
