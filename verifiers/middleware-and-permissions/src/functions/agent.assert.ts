import { streamAgent, runAgent } from '@pikku/core/agent'
import type { AgentStreamEvent, AgentStreamChannel } from '@pikku/core/agent'
import type {
  AgentRunnerService,
  AgentRunnerParams,
  AgentStepResult,
  AgentRunStateService,
  CreateRunInput,
  SaveScoreInput,
  AgentStorageService,
} from '@pikku/core/services'
import type {
  AgentRunState,
  AgentThread,
  AgentMessage,
} from '@pikku/core/agent'
import type { AgentRunScore } from '@pikku/core/agent-scorer'
import {
  assertMiddlewareAndPermissions,
  type ExpectedEvent,
} from '../assert-combined.js'
import { randomUUID } from 'crypto'
import { pikkuState } from '@pikku/core/state'
import { unsupportedChannelRemote } from '@pikku/core/channel'

class MockAgentRunner implements AgentRunnerService {
  async stream(
    _params: AgentRunnerParams,
    channel: AgentStreamChannel
  ): Promise<AgentStepResult> {
    channel.send({ type: 'text-delta', text: 'Hello' })
    channel.send({ type: 'text-delta', text: ' world' })
    channel.send({
      type: 'usage',
      tokens: { input: 10, output: 5 },
      model: 'test',
    })
    return {
      text: 'Hello world',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    }
  }

  async run(_params: AgentRunnerParams): Promise<AgentStepResult> {
    return {
      text: 'Hello world',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    }
  }
}

class MockAgentRunState implements AgentRunStateService {
  async createRun(_run: CreateRunInput): Promise<string> {
    return `run-${randomUUID()}`
  }
  async updateRun(
    _runId: string,
    _updates: Partial<AgentRunState>
  ): Promise<void> {}
  async getRun(_runId: string): Promise<AgentRunState | null> {
    return null
  }
  async getRunsByThread(_threadId: string): Promise<AgentRunState[]> {
    return []
  }
  async resolveApproval(
    _toolCallId: string,
    _status: 'approved' | 'denied'
  ): Promise<boolean> {
    return true
  }
  async findRunByToolCallId(_toolCallId: string): Promise<null> {
    return null
  }
  async saveScore(_score: SaveScoreInput): Promise<void> {}
  async getScores(_runId: string): Promise<AgentRunScore[]> {
    return []
  }
}

class MockAgentStorage implements AgentStorageService {
  /**
   * Threads this double has actually been asked to create.
   *
   * getThread used to answer with a hardcoded `resourceId` regardless of what
   * was stored, which was invisible while thread ownership went unchecked and
   * forges an owner mismatch now that it is enforced. A double that reports an
   * owner nobody set cannot exercise an ownership rule.
   */
  private readonly threads = new Map<string, AgentThread>()

  async createThread(
    resourceId: string,
    options?: { threadId?: string }
  ): Promise<AgentThread> {
    const thread: AgentThread = {
      id: options?.threadId ?? randomUUID(),
      resourceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.threads.set(thread.id, thread)
    return thread
  }
  async getThread(threadId: string): Promise<AgentThread> {
    const stored = this.threads.get(threadId)
    if (!stored) {
      // How a real store signals "no such thread": the interface is not
      // nullable, and the caller in agent-prepare wraps this in a try/catch
      // and creates the thread instead. Answering with an invented thread made
      // every first turn look like someone else's.
      throw new Error(`No thread found for ${threadId}`)
    }
    return stored
  }
  async getThreads(_resourceId: string): Promise<AgentThread[]> {
    return []
  }
  async deleteThread(_threadId: string): Promise<void> {}
  async getMessages(_threadId: string): Promise<AgentMessage[]> {
    return []
  }
  async saveMessages(
    _threadId: string,
    _messages: AgentMessage[]
  ): Promise<void> {}
  async getWorkingMemory(): Promise<Record<string, unknown> | null> {
    return null
  }
  async saveWorkingMemory(): Promise<void> {}
}

export async function testAgentStreamWiring(
  expected: ExpectedEvent[],
  singletonServices: any
): Promise<boolean> {
  console.log('\n\nTest: Agent stream with agent middleware')
  console.log('─────────────────────────')

  const services = {
    ...singletonServices,
    agentRunner: new MockAgentRunner(),
    agentRunState: new MockAgentRunState(),
    agentStorage: new MockAgentStorage(),
  }

  const events: AgentStreamEvent[] = []
  let agentChannelState: unknown
  const channel: AgentStreamChannel = {
    channelId: 'test-channel',
    openingData: undefined,
    state: 'open',
    close: () => {},
    sendBinary: () => {},
    send: (event: AgentStreamEvent) => {
      events.push(event)
    },
    setState: (s) => {
      agentChannelState = s
    },
    getState: () => agentChannelState as any,
    clearState: () => {
      agentChannelState = undefined
    },
    remote: unsupportedChannelRemote,
  }

  pikkuState(null, 'package', 'singletonServices', services)

  return await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await streamAgent(
        'testAgent',
        {
          message: 'hello',
          threadId: 'test-thread',
          resourceId: 'test-resource',
        },
        channel,
        {}
      )
    },
    services.logger
  )
}

export async function testAgentRunWiring(
  expected: ExpectedEvent[],
  singletonServices: any
): Promise<boolean> {
  console.log('\n\nTest: Agent run with AI middleware')
  console.log('─────────────────────────')

  const services = {
    ...singletonServices,
    agentRunner: new MockAgentRunner(),
    agentRunState: new MockAgentRunState(),
    agentStorage: new MockAgentStorage(),
  }

  pikkuState(null, 'package', 'singletonServices', services)

  return await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runAgent(
        'testAgent',
        {
          message: 'hello',
          threadId: 'test-thread',
          resourceId: 'test-resource',
        },
        {}
      )
    },
    services.logger
  )
}
