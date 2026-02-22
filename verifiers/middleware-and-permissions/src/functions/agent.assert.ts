import { streamAIAgent, runAIAgent } from '@pikku/core/ai-agent'
import type { AIStreamEvent, AIStreamChannel } from '@pikku/core/ai-agent'
import type {
  AIAgentRunnerService,
  AIAgentRunnerParams,
  AIAgentRunnerResult,
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

class MockAIAgentRunner implements AIAgentRunnerService {
  async stream(
    _params: AIAgentRunnerParams,
    channel: AIStreamChannel
  ): Promise<void> {
    channel.send({ type: 'text-delta', text: 'Hello' })
    channel.send({ type: 'text-delta', text: ' world' })
    channel.send({ type: 'done' })
  }

  async run(_params: AIAgentRunnerParams): Promise<AIAgentRunnerResult> {
    return {
      text: 'Hello world',
      steps: [],
      usage: { inputTokens: 10, outputTokens: 5 },
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
  ): Promise<void> {}
}

class MockAIStorage implements AIStorageService {
  async createThread(
    _resourceId: string,
    options?: { threadId?: string }
  ): Promise<AIThread> {
    return {
      id: options?.threadId ?? randomUUID(),
      resourceId: _resourceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
  async getThread(threadId: string): Promise<AIThread> {
    return {
      id: threadId,
      resourceId: 'test',
      createdAt: new Date(),
      updatedAt: new Date(),
    }
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
  const channel: AIStreamChannel = {
    channelId: 'test-channel',
    openingData: undefined,
    state: 'open',
    close: () => {},
    send: (event: AIStreamEvent) => {
      events.push(event)
    },
  }

  return await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await streamAIAgent(
        'test-agent',
        {
          message: 'hello',
          threadId: 'test-thread',
          resourceId: 'test-resource',
        },
        channel,
        { singletonServices: services }
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

  return await assertMiddlewareAndPermissions(
    expected,
    async () => {
      await runAIAgent(
        'test-agent',
        {
          message: 'hello',
          threadId: 'test-thread',
          resourceId: 'test-resource',
        },
        { singletonServices: services }
      )
    },
    services.logger
  )
}
