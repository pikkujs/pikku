import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { callAgentAs } from '../support/sse.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  messages: any[]
}

const callsContaining = async (text: string): Promise<MockLlmCall[]> => {
  const res = await fetch(`${config.apiUrl}/rpc/llmCallLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const log = (await res.json()) as MockLlmCall[]
  return log.filter((c) => JSON.stringify(c.messages).includes(text))
}

const AUDIO_DATA =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC'

When(
  'I run agent {string} with script {string} and message {string} and an audio attachment',
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
      resourceId: 'agent-voice',
      model: `mock/${script}`,
      attachments: [{ type: 'file', data: AUDIO_DATA, mediaType: 'audio/wav' }],
    })
  }
)

Then(
  'a model call was made whose messages include the transcript {string}',
  async function (this: AgentWorld, transcript: string) {
    const calls = await callsContaining(transcript)
    expect(
      calls.length,
      `no model call carried the transcript "${transcript}"`
    ).toBeGreaterThan(0)
  }
)

Then('no model call carries an audio content part', async function () {
  const res = await fetch(`${config.apiUrl}/rpc/llmCallLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const log = (await res.json()) as MockLlmCall[]
  const serialized = JSON.stringify(log)
  expect(serialized).not.toContain('audio/')
})

Then('the run failed', function (this: AgentWorld) {
  expect(this.agentResponse.status).toBeGreaterThanOrEqual(400)
})
