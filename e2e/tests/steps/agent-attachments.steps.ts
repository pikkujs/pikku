import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { callAgentAs } from '../support/sse.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  messages: any[]
}

const callsFor = async (message: string): Promise<MockLlmCall[]> => {
  const res = await fetch(`${config.apiUrl}/rpc/llmCallLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const log = (await res.json()) as MockLlmCall[]
  return log.filter((c) => c.userMessage === message)
}

const IMAGE_DATA =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'

When(
  'I run agent {string} with script {string} and message {string} and an image attachment',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    this.agentResponse = await callAgentAs({ userId: 'alice' }, agent, {
      message,
      threadId: this.threadId,
      resourceId: 'agent-attachments',
      model: `mock/${script}`,
      attachments: [
        { type: 'image', data: IMAGE_DATA, mediaType: 'image/png' },
      ],
    })
  }
)

When(
  'I run agent {string} with script {string} and message {string} and a file attachment named {string}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string,
    filename: string
  ) {
    this.agentMessage = message
    this.agentResponse = await callAgentAs({ userId: 'alice' }, agent, {
      message,
      threadId: this.threadId,
      resourceId: 'agent-attachments',
      model: `mock/${script}`,
      attachments: [
        {
          type: 'file',
          data: IMAGE_DATA,
          mediaType: 'application/pdf',
          filename,
        },
      ],
    })
  }
)

Then(
  'the model call for {string} carries an attachment with media type {string}',
  async function (this: AgentWorld, message: string, mediaType: string) {
    const calls = await callsFor(message)
    expect(calls.length, `no model call for "${message}"`).toBeGreaterThan(0)
    const userMessages = calls[0]!.messages.filter(
      (m: any) => m.role === 'user'
    )
    const serialized = JSON.stringify(userMessages)
    expect(serialized).toContain(mediaType)
  }
)

Then(
  'the model call for {string} carries a non-text content part',
  async function (this: AgentWorld, message: string) {
    const calls = await callsFor(message)
    const userMessages = calls[0]!.messages.filter(
      (m: any) => m.role === 'user'
    )
    const parts = userMessages.flatMap((m: any) =>
      Array.isArray(m.content) ? m.content : []
    )
    const nonText = parts.filter((p: any) => p.type && p.type !== 'text')
    expect(
      nonText.length,
      `expected a non-text part, got ${JSON.stringify(parts)}`
    ).toBeGreaterThan(0)
  }
)
