import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToString } from 'react-dom/server'
import { CorePikkuFetch, PikkuAgentStreamError } from '@pikku/fetch'

import {
  PikkuProvider,
  usePikkuAgent,
  type PikkuAgent,
} from './pikku-provider.tsx'

type Call = { url: string; body: unknown }

/**
 * The RPC client the generated `PikkuRPC` class is, reduced to its agent namespace and
 * pointed at a fetch that answers like the server: JSON for run and approve, an
 * event stream for stream.
 */
const agentClient = (calls: Call[]) => {
  const reply = (body: string, contentType: string) =>
    new Response(body, {
      status: 200,
      headers: { 'content-type': contentType },
    })
  const fetch = new CorePikkuFetch({
    serverUrl: 'https://api.test',
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) })
      if (url.endsWith('/stream')) {
        return reply(
          [
            { type: 'RUN_STARTED', threadId: 't1', runId: 'r1' },
            { type: 'TEXT_MESSAGE_CONTENT', messageId: 'm1', delta: 'Hello' },
            {
              type: 'CUSTOM',
              name: 'pikku:approval-request',
              value: {
                toolCallId: 'c1',
                toolName: 'refund',
                args: {},
                runId: 'r1',
              },
            },
            { type: 'RUN_FINISHED', threadId: 't1', runId: 'r1' },
          ]
            .map((event) => `data: ${JSON.stringify(event)}\n\n`)
            .join(''),
          'text/event-stream'
        )
      }
      if (url.endsWith('/approve')) {
        return reply(
          JSON.stringify({
            runId: 'r1',
            result: 'Refunded',
            usage: { inputTokens: 1, outputTokens: 1 },
          }),
          'application/json'
        )
      }
      return reply(
        JSON.stringify({
          runId: 'r1',
          result: '',
          usage: { inputTokens: 1, outputTokens: 0 },
          status: 'suspended',
          pendingApprovals: [
            { toolCallId: 'c1', toolName: 'refund', args: {}, runId: 'r1' },
          ],
        }),
        'application/json'
      )
    }) as typeof globalThis.fetch,
  })
  const route = (name: string, suffix = '') => `/rpc/agent/${name}${suffix}`
  const rpc = {
    agent: {
      run: (name: string, input: unknown) => fetch.post(route(name), input),
      stream: (
        name: string,
        input: unknown,
        options?: { signal?: AbortSignal }
      ) => fetch.agentStream(route(name, '/stream'), input, options),
      approve: (name: string, input: unknown) =>
        fetch.post(route(name, '/approve'), input),
    },
  }
  return { fetch, rpc }
}

/** Renders a component that calls the hook, and hands back what the hook returned. */
const renderAgent = (calls: Call[]): PikkuAgent => {
  let agent: PikkuAgent | undefined
  const Probe: React.FC = () => {
    agent = usePikkuAgent('helpAgent')
    return null
  }
  renderToString(
    <PikkuProvider pikku={agentClient(calls)}>
      <Probe />
    </PikkuProvider>
  )
  assert.ok(agent)
  return agent
}

const input = { message: 'Refund order 7', threadId: 't1', resourceId: 'help' }

test('stream yields the run events in order for the bound agent', async () => {
  const calls: Call[] = []
  const agent = renderAgent(calls)
  let text = ''
  const approvals: string[] = []
  const types: string[] = []
  for await (const event of agent.stream(input)) {
    types.push(event.type)
    if (event.type === 'TEXT_MESSAGE_CONTENT') text += event.delta
    if (event.type === 'CUSTOM' && event.name === 'pikku:approval-request') {
      approvals.push(event.value.toolCallId)
    }
  }
  assert.equal(text, 'Hello')
  assert.deepEqual(approvals, ['c1'])
  assert.deepEqual(types, [
    'RUN_STARTED',
    'TEXT_MESSAGE_CONTENT',
    'CUSTOM',
    'RUN_FINISHED',
  ])
  assert.deepEqual(calls, [
    { url: 'https://api.test/rpc/agent/helpAgent/stream', body: input },
  ])
})

test('run reports a suspended run and approve resumes it', async () => {
  const calls: Call[] = []
  const agent = renderAgent(calls)
  const reply = await agent.run(input)
  assert.equal(reply.status, 'suspended')
  if (reply.status !== 'suspended') return
  const { runId, toolCallId } = reply.pendingApprovals[0]!
  const resumed = await agent.approve({
    runId,
    approvals: [{ toolCallId, approved: true }],
  })
  assert.equal(resumed.result, 'Refunded')
  assert.equal(resumed.status, undefined)
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      'https://api.test/rpc/agent/helpAgent',
      'https://api.test/rpc/agent/helpAgent/approve',
    ]
  )
})

test('a RUN_ERROR from the server rejects the stream loop', async () => {
  const fetch = new CorePikkuFetch({
    serverUrl: 'https://api.test',
    fetch: (async () =>
      new Response(
        'data: {"type":"RUN_ERROR","message":"Internal server error"}\n\n',
        {
          status: 200,
        }
      )) as typeof globalThis.fetch,
  })
  let agent: PikkuAgent | undefined
  const Probe: React.FC = () => {
    agent = usePikkuAgent('helpAgent')
    return null
  }
  renderToString(
    <PikkuProvider
      pikku={{
        fetch,
        rpc: {
          agent: {
            stream: (name: string, i: unknown) =>
              fetch.agentStream(`/rpc/agent/${name}/stream`, i),
          },
        },
      }}
    >
      <Probe />
    </PikkuProvider>
  )
  await assert.rejects(
    (async () => {
      for await (const _event of agent!.stream(input)) {
        // drained until the error
      }
    })(),
    (err: unknown) =>
      err instanceof PikkuAgentStreamError &&
      err.message === 'Internal server error'
  )
})
