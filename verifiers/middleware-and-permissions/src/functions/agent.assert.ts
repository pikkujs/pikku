import { streamAIAgent, runAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamEvent, AIStreamChannel } from '@pikku/core/ai-agent'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentStepResult,
  AIRunStateService,
  CreateRunInput,
  AIStorageService,
} from '@pikku/core/services'
import type { AgentRunState, AIThread, AIMessage } from '@pikku/core/ai-agent'
import {
  assertMiddlewareAndPermissions,
  type ExpectedEvent,
} from '../assert-combined.js'
import { randomUUID } from 'crypto'
import { pikkuState } from '@pikku/core/ecosystem'
import { unsupportedChannelRemote } from '@pikku/core/channel'

class MockAIAgentRunner implements AIAgentRunnerService {
  async stream(
    _params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<AIAgentStepResult> {
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

  async run(_params: AIAgentRunnerParams): Promise<AIAgentStepResult> {
    return {
      text: 'Hello world',
      toolCalls: [],
      toolResults: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    }
  }
}

class MockAIRunState implements AIRunStateService {
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
}

class MockAIStorage implements AIStorageService {
  /**
   * Threads this double has actually been asked to create.
   *
   * getThread used to answer with a hardcoded `resourceId` regardless of what
   * was stored, which was invisible while thread ownership went unchecked and
   * forges an owner mismatch now that it is enforced. A double that reports an
   * owner nobody set cannot exercise an ownership rule.
   */
  private readonly threads = new Map<string, AIThread>()

  async createThread(
    resourceId: string,
    options?: { threadId?: string }
  ): Promise<AIThread> {
    const thread: AIThread = {
      id: options?.threadId ?? randomUUID(),
      resourceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    this.threads.set(thread.id, thread)
    return thread
  }
  async getThread(threadId: string): Promise<AIThread> {
    const stored = this.threads.get(threadId)
    if (!stored) {
      // How a real store signals "no such thread": the interface is not
      // nullable, and the caller in ai-agent-prepare wraps this in a try/catch
      // and creates the thread instead. Answering with an invented thread made
      // every first turn look like someone else's.
      throw new Error(`No thread found for ${threadId}`)
    }
    return stored
  }
  async getThreads(_resourceId: string): Promise<AIThread[]> {
    return []
  }
  async deleteThread(_threadId: string): Promise<void> {}
  async getMessages(_threadId: string): Promise<AIMessage[]> {
    return []
  }
  async saveMessages(
    _threadId: string,
    _messages: AIMessage[]
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
  console.log('\n\nTest: Agent stream with AI middleware')
  console.log('─────────────────────────')

  const services = {
    ...singletonServices,
    aiAgentRunner: new MockAIAgentRunner(),
    aiRunState: new MockAIRunState(),
    aiStorage: new MockAIStorage(),
  }

  const events: AIStreamEvent[] = []
  let agentChannelState: unknown
  const channel: AIStreamChannel = {
    channelId: 'test-channel',
    openingData: undefined,
    state: 'open',
    close: () => {},
    sendBinary: () => {},
    send: (event: AIStreamEvent) => {
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
      await streamAIAgent(
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
    aiAgentRunner: new MockAIAgentRunner(),
    aiRunState: new MockAIRunState(),
    aiStorage: new MockAIStorage(),
  }

  pikkuState(null, 'package', 'singletonServices', services)

  return await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runAIAgent(
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
