import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import type { AgentWorld } from '../support/world.js'
import { GUEST_USER } from '../../src/auth-fixtures.js'
import {
  AG_UI,
  callAgent,
  streamAgent,
  type StreamRecording,
} from '../support/sse.js'
import { config } from '../support/types.js'

type MockLlmCall = {
  userMessage: string
  instructions: string | undefined
  messages: any[]
  toolNames: string[]
  toolSchemas: Record<string, unknown>
  toolChoice: unknown
  modelId: string
  temperature: number | undefined
  stepIndex: number
}

declare module '../support/world.js' {
  interface AgentWorld {
    agentResponse?: { status: number; body: any }
    agentStream?: StreamRecording
    agentMessage?: string
  }
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

const body = (world: AgentWorld, script: string, message: string) => ({
  message,
  threadId: world.threadId,
  resourceId: 'agent-protocol',
  model: `mock/${script}`,
})

When(
  'I run agent {string} with script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    const actor = await this.signInAs(GUEST_USER)
    this.agentResponse = await callAgent(
      actor,
      agent,
      body(this, script, message)
    )
  }
)

When(
  'I run agent {string} with script {string} and message {string} at temperature {float}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string,
    temperature: number
  ) {
    this.agentMessage = message
    const actor = await this.signInAs(GUEST_USER)
    this.agentResponse = await callAgent(actor, agent, {
      ...body(this, script, message),
      temperature,
    })
  }
)

When(
  'I run agent {string} with script {string} and message {string} and context {string}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string,
    context: string
  ) {
    this.agentMessage = message
    const actor = await this.signInAs(GUEST_USER)
    this.agentResponse = await callAgent(actor, agent, {
      ...body(this, script, message),
      context,
    })
  }
)

When(
  'I stream agent {string} with script {string} and message {string}',
  async function (
    this: AgentWorld,
    agent: string,
    script: string,
    message: string
  ) {
    this.agentMessage = message
    const actor = await this.signInAs(GUEST_USER)
    this.agentStream = await streamAgent(
      actor,
      agent,
      body(this, script, message)
    )
  }
)

Then(
  'the run result is {string}',
  function (this: AgentWorld, expected: string) {
    expect(this.agentResponse?.body?.result).toBe(expected)
  }
)

Then(
  'the run reports {int} model call(s)',
  async function (this: AgentWorld, count: number) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls).toHaveLength(count)
  }
)

Then(
  'model call {int} was offered the tool {string}',
  async function (this: AgentWorld, index: number, tool: string) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.toolNames).toContain(tool)
  }
)

Then(
  'model call {int} received the result of the tool call',
  async function (this: AgentWorld, index: number) {
    const calls = await callsFor(this.agentMessage!)
    const roles = calls[index - 1]?.messages.map((m: any) => m.role) ?? []
    expect(roles).toContain('tool')
  }
)

Then(
  'the model calls have step indexes {int}, {int}, {int}',
  async function (this: AgentWorld, a: number, b: number, c: number) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls.map((call) => call.stepIndex)).toEqual([a, b, c])
  }
)

Then(
  'every offered tool has an input schema',
  async function (this: AgentWorld) {
    const calls = await callsFor(this.agentMessage!)
    const call = calls[0]!
    expect(call.toolNames.length).toBeGreaterThan(0)
    for (const name of call.toolNames) {
      expect(
        call.toolSchemas[name],
        `tool ${name} has no input schema`
      ).toBeTruthy()
    }
  }
)

Then(
  'model call {int} carried non-empty instructions',
  async function (this: AgentWorld, index: number) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.instructions?.length ?? 0).toBeGreaterThan(0)
  }
)

Then(
  'model call {int} used temperature {float}',
  async function (this: AgentWorld, index: number, temperature: number) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.temperature).toBe(temperature)
  }
)

Then(
  'model call {int} used model {string}',
  async function (this: AgentWorld, index: number, model: string) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.modelId).toBe(model)
  }
)

Then(
  'model call {int} instructions include {string}',
  async function (this: AgentWorld, index: number, fragment: string) {
    const calls = await callsFor(this.agentMessage!)
    expect(calls[index - 1]?.instructions ?? '').toContain(fragment)
  }
)

Then(
  'the stream starts with {string} and ends with {string}',
  function (this: AgentWorld, first: string, last: string) {
    const types = this.agentStream!.types()
    expect(types[0]).toBe(first)
    expect(types[types.length - 1]).toBe(last)
  }
)

Then('the stream contains {string}', function (this: AgentWorld, type: string) {
  expect(this.agentStream!.ofType(type).length).toBeGreaterThan(0)
})

Then(
  'the stream contains {int} {string} events',
  function (this: AgentWorld, count: number, type: string) {
    expect(this.agentStream!.ofType(type)).toHaveLength(count)
  }
)

Then('the streamed text matches the run result', function (this: AgentWorld) {
  expect(this.agentStream!.text()).toBe(this.agentResponse?.body?.result)
})

Then(
  '{string} precedes {string} in the stream',
  function (this: AgentWorld, before: string, after: string) {
    const recording = this.agentStream!
    const beforeIndex = recording.indexOf(before)
    const afterIndex = recording.indexOf(after)
    expect(beforeIndex, `${before} missing from stream`).toBeGreaterThanOrEqual(
      0
    )
    expect(afterIndex, `${after} missing from stream`).toBeGreaterThanOrEqual(0)
    expect(beforeIndex).toBeLessThan(afterIndex)
  }
)

Then(
  'the tool call and its result share a toolCallId',
  function (this: AgentWorld) {
    const start = this.agentStream!.first(AG_UI.toolCallStart)
    const result = this.agentStream!.first(AG_UI.toolCallResult)
    expect(start?.toolCallId).toBeTruthy()
    expect(result?.toolCallId).toBe(start?.toolCallId)
  }
)

Then(
  'the finished run reports non-zero token usage',
  function (this: AgentWorld) {
    const usage = this.agentStream!.first(AG_UI.runFinished)?.usage as
      | { totalTokens?: number }
      | undefined
    expect(usage?.totalTokens ?? 0).toBeGreaterThan(0)
  }
)

Then('the agent call fails', function (this: AgentWorld) {
  const { status, body } = this.agentResponse!
  const failed = status >= 400 || Boolean(body?.message ?? body?.errorId)
  expect(
    failed,
    `expected a failure, got ${status} ${JSON.stringify(body)}`
  ).toBe(true)
})

Then('no model call is made', async function (this: AgentWorld) {
  expect(await callsFor(this.agentMessage!)).toHaveLength(0)
})
