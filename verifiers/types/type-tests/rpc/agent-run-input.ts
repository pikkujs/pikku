/**
 * Type constraint: rpc.agent.run/stream take the full AgentInput
 *
 * The generated map used to declare its own three-field copy of AgentInput, so the
 * optional fields the runner honours at runtime — model, temperature, attachments,
 * context — were type errors at every call site.
 */

import type { TypedPikkuRPC } from '#pikku/rpc/pikku-rpc-wirings-map.gen.js'

declare const rpc: TypedPikkuRPC

// Valid: the required fields on their own
rpc.agent.run('typedAgent', {
  message: 'hello',
  threadId: 'thread-1',
  resourceId: 'user-1',
})

// Valid: per-run model and temperature overrides
rpc.agent.run('typedAgent', {
  message: 'hello',
  threadId: 'thread-1',
  resourceId: 'user-1',
  model: 'openai/gpt-5',
  temperature: 0.2,
})

// Valid: attachments and upfront context
rpc.agent.run('typedAgent', {
  message: 'describe this',
  threadId: 'thread-1',
  resourceId: 'user-1',
  attachments: [{ type: 'image', url: 'https://example.com/a.png' }],
  context: 'orgId=acme',
})

// Valid: the same input shape on the streaming call
rpc.agent.stream('typedAgent', {
  message: 'hello',
  threadId: 'thread-1',
  resourceId: 'user-1',
  model: 'openai/gpt-5',
})

// @ts-expect-error — threadId is required
rpc.agent.run('typedAgent', { message: 'hello', resourceId: 'user-1' })

rpc.agent.run('typedAgent', {
  message: 'hello',
  threadId: 'thread-1',
  resourceId: 'user-1',
  // @ts-expect-error — unknown fields are still rejected
  temprature: 0.2,
})
