import { Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  modelId: string
}

const allCalls = async (): Promise<MockLlmCall[]> => {
  const res = await fetch(`${config.apiUrl}/rpc/llmCallLog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  return (await res.json()) as MockLlmCall[]
}

Then(
  'the sub-agent model {string} was invoked with message {string}',
  async function (this: AgentWorld, model: string, message: string) {
    const calls = await allCalls()
    const match = calls.find(
      (c) => c.modelId === model && c.userMessage === message
    )
    expect(
      match,
      `no model call with model ${model} and message ${message}; saw ${JSON.stringify(
        calls.map((c) => ({ modelId: c.modelId, userMessage: c.userMessage }))
      )}`
    ).toBeTruthy()
  }
)

Then(
  'the streamed text contains {string}',
  function (this: AgentWorld, fragment: string) {
    expect(this.agentStream!.text()).toContain(fragment)
  }
)

Then(
  'the streamed text does not contain {string}',
  function (this: AgentWorld, fragment: string) {
    expect(this.agentStream!.text()).not.toContain(fragment)
  }
)
