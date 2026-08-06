import { beforeEach, describe, test } from 'node:test'
import assert from 'node:assert/strict'

import { resetPikkuState, pikkuState } from '../../pikku-state.js'
import {
  interruptAIAgent,
  resumeAIAgent,
  streamAIAgent,
} from './ai-agent-stream.js'
import { runAIAgent, resumeAIAgentSync } from './ai-agent-runner.js'
import {
  AgentInterruptedError,
  awaitPendingInterruptNote,
  getInFlightTools,
  isAbortError,
  isRunInterruptible,
  registerInterruptibleRun,
  signalRunInterrupt,
  trackToolExecution,
} from './ai-agent-interrupt.js'
import { AbandonedError, beginChanges } from '../../function/abort-scope.js'
import type {
  AgentRunState,
  AIMessage,
  AIStreamEvent,
  CoreAIAgent,
} from './ai-agent.types.js'
import type {
  AIAgentRunnerParams,
  AIAgentStepResult,
} from '../../services/ai-agent-runner-service.js'

beforeEach(() => {
  resetPikkuState()
})

const addTestAgent = (agentName: string) => {
  const agent: CoreAIAgent = {
    name: agentName,
    description: 'test agent',
    goal: 'be helpful',
    model: 'test/test-model',
  }
  pikkuState(null, 'agent', 'agentsMeta')[agentName] = {
    ...agent,
    inputSchema: null,
    outputSchema: null,
    workingMemorySchema: null,
  }
  pikkuState(null, 'agent', 'agents').set(agentName, agent)
}

const abortError = () => {
  const error = new Error('The operation was aborted')
  error.name = 'AbortError'
  return error
}

/**
 * A runner that emits one delta, has the user talk over it, and then rejects
 * the way a fetch-based provider rejects on cancellation.
 */
const interruptingRunner = (getRunId: () => string | undefined) => ({
  stream: async (
    params: AIAgentRunnerParams,
    channel: { send: (event: AIStreamEvent) => void }
  ): Promise<AIAgentStepResult> => {
    channel.send({ type: 'text-delta', text: 'I will delete the staging ' })
    const runId = getRunId()
    assert.ok(runId, 'run should exist before the model call')
    assert.ok(params.abortSignal, 'the runner must receive an abort signal')
    assert.equal(signalRunInterrupt(runId, { reason: 'speech' }), true)
    assert.equal(params.abortSignal.aborted, true)
    throw abortError()
  },
})

describe('agent interruption', () => {
  test('marks the run interrupted and reports the truncated text', async () => {
    addTestAgent('interrupted-agent')

    const updates: Array<{ runId: string; patch: unknown }> = []
    const events: AIStreamEvent[] = []
    let runId: string | undefined

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: interruptingRunner(() => runId),
      aiRunState: {
        createRun: async () => 'run-interrupted',
        updateRun: async (id: string, patch: unknown) => {
          updates.push({ runId: id, patch })
        },
      },
    } as any)

    const text = await streamAIAgent(
      'interrupted-agent',
      {
        message: 'delete staging',
        threadId: 'thread-int',
        resourceId: 'resource-int',
      },
      {
        channelId: 'channel-int',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      } as any,
      {},
      undefined,
      { onRunCreated: (id: string) => (runId = id) }
    )

    assert.equal(text, 'I will delete the staging ')
    assert.deepEqual(updates, [
      { runId: 'run-interrupted', patch: { status: 'interrupted' } },
    ])

    const interrupted = events.find((event) => event.type === 'interrupted')
    assert.ok(interrupted, 'an interrupted event should reach the client')
    assert.deepEqual(interrupted, {
      type: 'interrupted',
      runId: 'run-interrupted',
      text: 'I will delete the staging ',
      reason: 'speech',
    })

    // The client must still see exactly one terminal event, so an interrupted
    // run closes down the same path as a clean one.
    assert.equal(events.filter((event) => event.type === 'done').length, 1)
    assert.equal(
      events.some((event) => event.type === 'error'),
      false
    )
  })

  test('persists the truncated reply marked as interrupted', async () => {
    addTestAgent('interrupted-persisting-agent')

    const saved: AIMessage[] = []
    let runId: string | undefined

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: interruptingRunner(() => runId),
      aiRunState: {
        createRun: async () => 'run-persist-int',
        updateRun: async () => {},
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async (_threadId: string, messages: AIMessage[]) => {
          saved.push(...messages)
        },
      },
    } as any)

    await streamAIAgent(
      'interrupted-persisting-agent',
      {
        message: 'delete staging',
        threadId: 'thread-persist-int',
        resourceId: 'resource-persist-int',
      },
      {
        channelId: 'channel-persist-int',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      } as any,
      {},
      undefined,
      { onRunCreated: (id: string) => (runId = id) }
    )

    const assistant = saved.find((message) => message.role === 'assistant')
    assert.ok(assistant, 'the partial reply should be persisted, not dropped')
    assert.equal(assistant.content, 'I will delete the staging ')
    assert.equal(
      assistant.interrupted,
      true,
      'the fragment must be marked so the next turn can tell it apart from a finished reply'
    )
  })

  test('releases the run once it ends, so a late interrupt is a no-op', async () => {
    addTestAgent('released-agent')

    let runId: string | undefined

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (): Promise<AIAgentStepResult> => ({
          text: 'done',
          toolCalls: [],
          toolResults: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        }),
      },
      aiRunState: {
        createRun: async () => 'run-released',
        updateRun: async () => {},
      },
    } as any)

    await streamAIAgent(
      'released-agent',
      { message: 'hi', threadId: 't', resourceId: 'r' },
      {
        channelId: 'c',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      } as any,
      {},
      undefined,
      { onRunCreated: (id: string) => (runId = id) }
    )

    assert.ok(runId)
    assert.equal(isRunInterruptible(runId), false)
    // Racing a run that finishes on its own is the normal case in voice, so it
    // must report "nothing to interrupt" rather than throw.
    assert.equal(signalRunInterrupt(runId), false)
  })

  test('recognises provider cancellation errors as aborts, not failures', () => {
    assert.equal(isAbortError(abortError()), true)
    assert.equal(isAbortError(new Error('stream failed')), false)
  })
})

/** Register a pikku function so an agent can call it by name as a tool. */
const addTestTool = (
  agentName: string,
  toolName: string,
  func: () => Promise<unknown>
) => {
  pikkuState(null, 'function', 'functions').set(toolName, { func })
  pikkuState(null, 'function', 'meta')[toolName] = {
    pikkuFuncName: toolName,
    description: `${toolName} tool`,
    services: [],
    // The tool runs as an RPC, which refuses a sessionful function without a
    // session; this test is about interruption, not auth.
    sessionless: true,
  } as any
  // Unnamespaced tools resolve name → funcId through the RPC registry first;
  // without this the tool is silently dropped as a missing RPC.
  pikkuState(null, 'rpc', 'meta')[toolName] = toolName
  const tools = [toolName]
  pikkuState(null, 'agent', 'agents').get(agentName)!.tools = tools
  pikkuState(null, 'agent', 'agentsMeta')[agentName]!.tools = tools
}

describe('tool results that outlive an interrupt', () => {
  test('a tool still running when the user cuts in is kept, not dropped', async () => {
    addTestAgent('tool-interrupt-agent')

    const saved: AIMessage[] = []
    let runId: string | undefined
    let releaseTool: (value: string) => void
    const toolFinished = new Promise<string>((resolve) => {
      releaseTool = resolve
    })
    addTestTool('tool-interrupt-agent', 'deploy', () => toolFinished)

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: {
        stream: async (
          params: AIAgentRunnerParams,
          channel: { send: (event: AIStreamEvent) => void }
        ): Promise<AIAgentStepResult> => {
          // The agent kicks off a deploy and starts narrating it; the user talks
          // over the narration while the deploy is still running.
          const tool = params.tools[0]
          assert.ok(tool, 'the agent should expose its deploy tool')
          const call = tool.execute({ env: 'staging' })
          channel.send({ type: 'text-delta', text: 'Deploying to ' })
          assert.equal(signalRunInterrupt(runId!, { reason: 'speech' }), true)
          releaseTool('deployed 3 services')
          await call
          throw abortError()
        },
      },
      aiRunState: {
        createRun: async () => 'run-tool-int',
        updateRun: async () => {},
      },
      aiStorage: {
        createThread: async () => {},
        getMessages: async () => [],
        saveMessages: async (_threadId: string, messages: AIMessage[]) => {
          saved.push(...messages)
        },
      },
    } as any)

    await streamAIAgent(
      'tool-interrupt-agent',
      { message: 'deploy staging', threadId: 'thread-tool', resourceId: 'r' },
      {
        channelId: 'c',
        openingData: undefined,
        state: 'open',
        send: () => {},
        close: () => {},
      } as any,
      {},
      undefined,
      { onRunCreated: (id: string) => (runId = id) }
    )

    // The stream deliberately does not await the write, so the next run on this
    // thread is what waits for it — exercise that path rather than sleeping.
    await awaitPendingInterruptNote('thread-tool')

    const note = saved.find((message) => message.role === 'tool')
    assert.ok(note, 'the settled tool result must reach the thread')
    assert.equal(
      note.undelivered,
      true,
      'the model never described this result, and the next turn has to know that'
    )
    assert.equal(note.toolResults?.[0]?.name, 'deploy')
    assert.match(String(note.toolResults?.[0]?.result), /deployed 3 services/)
  })

  test('reports what is in flight without offering to undo it', async () => {
    const handle = registerInterruptibleRun('run-inflight')
    let finish: () => void
    const running = new Promise<void>((resolve) => {
      finish = resolve
    })
    const tracked = handle.trackTool('deploy', 'tc-1', () => running)

    assert.deepEqual(getInFlightTools('run-inflight'), ['deploy'])
    signalRunInterrupt('run-inflight', { reason: 'speech' })
    finish!()
    await tracked

    assert.deepEqual(await handle.settle(), [
      { toolCallId: 'tc-1', toolName: 'deploy', result: undefined },
    ])
    assert.deepEqual(getInFlightTools('run-inflight'), [])
    handle.release()
  })

  test('a tool that bails at its own checkpoint leaves nothing to report', async () => {
    const handle = registerInterruptibleRun('run-declared')
    const tools = trackToolExecution(
      [
        {
          name: 'deploy',
          execute: async () => {
            // Interruptible work first, then the point of no return.
            await new Promise((resolve) => setImmediate(resolve))
            await beginChanges()
            return 'deployed'
          },
        },
      ],
      handle
    )

    signalRunInterrupt('run-declared', { reason: 'speech' })
    await assert.rejects(() => tools[0]!.execute({}), AbandonedError)

    // Nothing was changed, so there is nothing to tell the user — reporting
    // "it aborted" is exactly the noise the checkpoint exists to remove.
    assert.deepEqual(await handle.settle(), [])
    handle.release()
  })

  test('a mutating tool with no checkpoint is still reported', async () => {
    const handle = registerInterruptibleRun('run-undeclared')
    let finish: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    const tools = trackToolExecution(
      [{ name: 'deploy', execute: () => work }],
      handle
    )

    const call = tools[0]!.execute({})
    signalRunInterrupt('run-undeclared', { reason: 'speech' })
    finish!('deployed 3 services')
    await call

    // The tool that never declared a checkpoint is the one that cannot be
    // assumed harmless, so the default has to fail toward telling the user.
    const orphaned = await handle.settle()
    assert.equal(orphaned.length, 1)
    assert.equal(orphaned[0]!.toolName, 'deploy')
    assert.equal(orphaned[0]!.result, 'deployed 3 services')
    handle.release()
  })

  test('an interrupted read is discarded rather than reported', async () => {
    const handle = registerInterruptibleRun('run-read')
    let finish: (value: string) => void
    const reading = new Promise<string>((resolve) => {
      finish = resolve
    })
    const tracked = handle.trackTool('lookup', 'tc-3', () => reading, {
      collectResult: false,
    })

    signalRunInterrupt('run-read', { reason: 'speech' })
    finish!('weather: sunny')
    await tracked

    // Nothing changed, so there is nothing to tell the user about — and by the
    // next turn this answer may be wrong anyway.
    assert.deepEqual(await handle.settle(), [])
    handle.release()
  })

  test('a tool that settles before the interrupt is not orphaned', async () => {
    const handle = registerInterruptibleRun('run-quick')
    await handle.trackTool('lookup', 'tc-2', async () => 'done')
    signalRunInterrupt('run-quick', { reason: 'speech' })

    assert.deepEqual(await handle.settle(), [])
    handle.release()
  })
})

/**
 * The non-streaming path (`rpc.agent.run` / `rpc.agent.approve`) creates runs
 * through the same `aiRunState`, so `interruptAIAgent` resolves and authorizes
 * them either way. If it did not also register an abort controller, that call
 * would pass the ownership check, fail to stop anything, and — because the run
 * is still marked `running` — report it as executing on another instance.
 */
describe('non-streaming agent interruption', () => {
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }

  const interruptingSyncRunner = (runId: string) => ({
    run: async (params: AIAgentRunnerParams): Promise<AIAgentStepResult> => {
      assert.ok(params.abortSignal, 'the runner must receive an abort signal')
      assert.equal(
        isRunInterruptible(runId),
        true,
        'the run must be reachable by runId while the model call is in flight'
      )
      assert.equal(signalRunInterrupt(runId, { reason: 'speech' }), true)
      assert.equal(params.abortSignal.aborted, true)
      throw abortError()
    },
  })

  test('runAIAgent reports an interrupt as an interrupt, not a failure', async () => {
    addTestAgent('sync-agent')

    const updates: unknown[] = []
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      aiAgentRunner: interruptingSyncRunner('run-sync-int'),
      aiRunState: {
        createRun: async () => 'run-sync-int',
        updateRun: async (_runId: string, patch: unknown) => {
          updates.push(patch)
        },
      },
    } as any)

    await assert.rejects(
      () =>
        runAIAgent(
          'sync-agent',
          { message: 'delete staging', threadId: 't', resourceId: 'r' },
          {}
        ),
      (error: unknown) => {
        assert.ok(error instanceof AgentInterruptedError)
        assert.equal(error.runId, 'run-sync-int')
        assert.deepEqual(error.interruption, { reason: 'speech' })
        return true
      }
    )

    // No `failed` and no `errorMessage`: a cancelled run is not an outage, and
    // anything reading run history to page someone must be able to tell.
    assert.deepEqual(updates, [{ status: 'interrupted' }])
    assert.equal(isRunInterruptible('run-sync-int'), false)
  })

  test('releases a clean non-streaming run', async () => {
    addTestAgent('sync-clean-agent')

    pikkuState(null, 'package', 'singletonServices', {
      logger,
      aiAgentRunner: {
        run: async (): Promise<AIAgentStepResult> => ({
          text: 'done',
          toolCalls: [],
          toolResults: [],
          usage: { inputTokens: 0, outputTokens: 0 },
          finishReason: 'stop',
        }),
      },
      aiRunState: {
        createRun: async () => 'run-sync-clean',
        updateRun: async () => {},
      },
    } as any)

    await runAIAgent(
      'sync-clean-agent',
      { message: 'hi', threadId: 't', resourceId: 'r' },
      {}
    )
    assert.equal(isRunInterruptible('run-sync-clean'), false)
  })

  test('a resumed run is interruptible on its own terms', async () => {
    addTestAgent('sync-resume-agent')

    const run: AgentRunState = {
      runId: 'run-sync-resume',
      agentName: 'sync-resume-agent',
      threadId: 'thread-sync-resume',
      resourceId: 'resource-sync-resume',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const updates: unknown[] = []
    pikkuState(null, 'package', 'singletonServices', {
      logger,
      aiAgentRunner: interruptingSyncRunner('run-sync-resume'),
      aiRunState: {
        getRun: async () => run,
        createRun: async () => 'unused',
        updateRun: async (_runId: string, patch: unknown) => {
          updates.push(patch)
        },
        resolveApproval: async () => true,
      },
    } as any)

    await assert.rejects(
      () =>
        resumeAIAgentSync('run-sync-resume', [], {
          sessionService: { get: () => ({ userId: 'resource-sync-resume' }) },
        } as any),
      (error: unknown) => error instanceof AgentInterruptedError
    )

    // `running` is set on the way in; the interrupt is the last word.
    assert.deepEqual(updates.at(-1), { status: 'interrupted' })
    assert.equal(isRunInterruptible('run-sync-resume'), false)
  })
})

describe('streaming resume interruption', () => {
  /**
   * The turn after an approval is where a voice agent does most of its
   * talking — "done, I deleted it, and while I was there…" — so it is at least
   * as likely to be talked over as the first one. It went unregistered for a
   * while, which made it silently uninterruptible: the interrupt call found no
   * handle and reported nothing to stop.
   */
  test('a resumed stream can be talked over like any other', async () => {
    addTestAgent('resume-stream-agent')
    // The resume path validates the approved call against the agent's tools.
    addTestTool('resume-stream-agent', 'deleteTodo', async () => ({
      success: true,
    }))

    const run: AgentRunState = {
      runId: 'run-stream-resume',
      agentName: 'resume-stream-agent',
      threadId: 'thread-stream-resume',
      resourceId: 'resource-stream-resume',
      status: 'suspended',
      suspendReason: 'approval',
      pendingApprovals: [
        {
          toolCallId: 'call-1',
          toolName: 'deleteTodo',
          args: {},
          reason: 'Delete the todo called "Buy milk"',
        } as any,
      ],
      usage: { inputTokens: 0, outputTokens: 0, model: 'test/test-model' },
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const updates: unknown[] = []
    const events: AIStreamEvent[] = []

    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiAgentRunner: interruptingRunner(() => run.runId),
      aiRunState: {
        getRun: async () => run,
        createRun: async () => run.runId,
        updateRun: async (_runId: string, patch: unknown) => {
          updates.push(patch)
        },
        // Clearing it is what lets the resume continue rather than sit waiting
        // for approvals that have already been given.
        resolveApproval: async () => {
          run.pendingApprovals = []
          return true
        },
      },
    } as any)

    await resumeAIAgent(
      { runId: run.runId, toolCallId: 'call-1', approved: true },
      {
        channelId: 'channel-resume',
        openingData: undefined,
        state: 'open',
        send: (event: AIStreamEvent) => events.push(event),
        close: () => {},
      } as any,
      {
        sessionService: { get: () => ({ userId: 'resource-stream-resume' }) },
      } as any
    )

    // Recorded as interrupted, not failed: nothing went wrong.
    assert.deepEqual(updates.at(-1), { status: 'interrupted' })

    const interrupted = events.find((event) => event.type === 'interrupted')
    assert.ok(interrupted, 'the resumed stream should report the interrupt')
    assert.equal((interrupted as any).reason, 'speech')
    assert.equal((interrupted as any).text, 'I will delete the staging ')

    // No `error` event — that would send the client down the failure path for
    // something the user did on purpose.
    assert.equal(
      events.some((event) => event.type === 'error'),
      false
    )
    assert.equal(isRunInterruptible(run.runId), false)
  })
})

describe('interruptAIAgent authorization', () => {
  const withRun = (run: Record<string, unknown> | null) => {
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      },
      aiRunState: { getRun: async () => run },
    } as any)
  }

  const session = (userId: string) => ({
    sessionService: { get: () => ({ userId }) },
  })

  test('refuses a run owned by someone else', async () => {
    addTestAgent('owned-agent')
    withRun({
      runId: 'run-alice',
      agentName: 'owned-agent',
      resourceId: 'alice:thread-1',
      status: 'running',
    })

    const handle = registerInterruptibleRun('run-alice')
    await assert.rejects(
      () => interruptAIAgent({ runId: 'run-alice' }, session('mallory') as any),
      /Not authorized to access this run/
    )
    // The gate has to hold before the abort, not after it.
    assert.equal(handle.signal.aborted, false)
    handle.release()
  })

  test('refuses a lookalike principal rather than prefix-matching it', async () => {
    addTestAgent('lookalike-agent')
    withRun({
      runId: 'run-alice-2',
      agentName: 'lookalike-agent',
      resourceId: 'alice-evil:thread-1',
      status: 'running',
    })

    const handle = registerInterruptibleRun('run-alice-2')
    await assert.rejects(
      () => interruptAIAgent({ runId: 'run-alice-2' }, session('alice') as any),
      /Not authorized to access this run/
    )
    assert.equal(handle.signal.aborted, false)
    handle.release()
  })

  test('stops a run the caller owns', async () => {
    addTestAgent('mine-agent')
    withRun({
      runId: 'run-mine',
      agentName: 'mine-agent',
      resourceId: 'alice:thread-1',
      status: 'running',
    })

    const handle = registerInterruptibleRun('run-mine')
    const result = await interruptAIAgent(
      { runId: 'run-mine', reason: 'speech' },
      session('alice') as any
    )
    assert.deepEqual(result, { stopped: true, inFlightTools: [] })
    assert.equal(handle.signal.aborted, true)
    assert.deepEqual(handle.interruption, { reason: 'speech' })
    handle.release()
  })

  test('reports false rather than throwing when the run already finished', async () => {
    addTestAgent('finished-agent')
    withRun({
      runId: 'run-finished',
      agentName: 'finished-agent',
      resourceId: 'alice:thread-1',
      status: 'completed',
    })

    assert.deepEqual(
      await interruptAIAgent(
        { runId: 'run-finished' },
        session('alice') as any
      ),
      { stopped: false, inFlightTools: [] }
    )
  })

  test('warns instead of failing silently when the run is on another instance', async () => {
    addTestAgent('remote-agent')
    const warnings: string[] = []
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: (message: string) => warnings.push(message),
        error: () => {},
        debug: () => {},
      },
      aiRunState: {
        getRun: async () => ({
          runId: 'run-elsewhere',
          agentName: 'remote-agent',
          resourceId: 'alice:thread-1',
          // Still running, but never registered here — i.e. another process.
          status: 'running',
        }),
      },
    } as any)

    assert.deepEqual(
      await interruptAIAgent(
        { runId: 'run-elsewhere' },
        session('alice') as any
      ),
      { stopped: false, inFlightTools: [] }
    )
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /running in another process/)
  })

  test('stays quiet when the run simply finished', async () => {
    addTestAgent('done-agent')
    const warnings: string[] = []
    pikkuState(null, 'package', 'singletonServices', {
      logger: {
        info: () => {},
        warn: (message: string) => warnings.push(message),
        error: () => {},
        debug: () => {},
      },
      aiRunState: {
        getRun: async () => ({
          runId: 'run-done',
          agentName: 'done-agent',
          resourceId: 'alice:thread-1',
          status: 'completed',
        }),
      },
    } as any)

    await interruptAIAgent({ runId: 'run-done' }, session('alice') as any)
    assert.deepEqual(warnings, [])
  })

  test('rejects an unknown runId', async () => {
    withRun(null)
    await assert.rejects(
      () => interruptAIAgent({ runId: 'nope' }, session('alice') as any),
      /No run found for runId nope/
    )
  })
})
