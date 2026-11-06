import assert from 'node:assert/strict'
import { before, beforeEach, describe, test } from 'node:test'

import '../.pikku/pikku-bootstrap.gen.js'
import { fetch } from '@pikku/core/http'
import type { PikkuWorkflowService } from '@pikku/core/workflow'
import { createConfig, createSingletonServices } from './services.js'
import { hops, type Hop } from './tracing.functions.js'

const CALLER_TRACE = '4bf92f3577b34da6a3ce929d0e0e4736'
const CALLER_SPAN = '00f067aa0ba902b7'
const CALLER_TRACEPARENT = `00-${CALLER_TRACE}-${CALLER_SPAN}-01`
const TRACE_ID = /^[0-9a-f]{32}$/

const post = async (
  route: string,
  headers: Record<string, string> = {}
): Promise<any> => {
  const response = await fetch(
    new Request(`http://localhost${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: '{}',
    })
  )
  assert.equal(response.status, 200, route)
  return await response.json()
}

const waitForHops = async (...names: string[]): Promise<Hop[]> => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    const found = names.map((name) => hops.find((hop) => hop.at === name))
    if (found.every(Boolean)) return found as Hop[]
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail(`never saw ${names}; saw ${hops.map((hop) => hop.at)}`)
}

before(async () => {
  process.env.PIKKU_MESH_SECRET =
    'tracing-verifier-mesh-secret-of-enough-length'
  const services = await createSingletonServices(await createConfig())
  ;(services.workflowService as PikkuWorkflowService).wireQueueWorkers()
})

beforeEach(() => {
  hops.length = 0
})

describe('a public request', () => {
  test('gets a W3C trace id of its own', async () => {
    const hop = await post('/trace/echo')
    assert.match(hop.traceId, TRACE_ID)
  })

  test('cannot choose its trace with traceparent', async () => {
    const hop = await post('/trace/echo', { traceparent: CALLER_TRACEPARENT })
    assert.match(hop.traceId, TRACE_ID)
    assert.notEqual(hop.traceId, CALLER_TRACE)
    assert.equal(hop.parentSpanId, undefined)
  })

  test('cannot choose its trace with x-request-id', async () => {
    const hop = await post('/trace/echo', { 'x-request-id': CALLER_TRACE })
    assert.notEqual(hop.traceId, CALLER_TRACE)
  })

  test('hands back its trace id as errorId', async () => {
    const response = await fetch(
      new Request('http://localhost/trace/fails', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    )
    assert.equal(response.status, 403)
    const { errorId } = (await response.json()) as { errorId?: string }
    assert.match(errorId ?? '', TRACE_ID)
  })
})

describe('a mesh hop', () => {
  test('continues the caller trace once its JWT verifies', async () => {
    const caller = await post('/trace/mesh')
    assert.match(caller.traceId, TRACE_ID)
    assert.equal(caller.mesh.at, 'mesh')
    assert.equal(caller.mesh.traceId, caller.traceId)
    assert.match(caller.mesh.parentSpanId, /^[0-9a-f]{16}$/)
  })
})

describe('a call to the mesh route without a valid JWT', () => {
  test('is refused, and the forged traceparent reaches no function', async () => {
    const response = await fetch(
      new Request('http://localhost/mesh/rpc/traceEcho', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          traceparent: CALLER_TRACEPARENT,
          authorization: 'Bearer forged',
        },
        body: JSON.stringify({ rpcName: 'traceEcho', data: { at: 'forged' } }),
      })
    )
    assert.ok(response.status >= 400, `status ${response.status}`)
    assert.deepEqual(hops, [])
  })
})

describe('background work', () => {
  test('a job keeps the trace of the request that enqueued it', async () => {
    const request = await post('/trace/job')
    const [job] = await waitForHops('job')
    assert.match(request.traceId, TRACE_ID)
    assert.equal(job!.traceId, request.traceId)
  })

  test('a delayed RPC keeps the trace of the request that scheduled it', async () => {
    const request = await post('/trace/delayed')
    const [delayed] = await waitForHops('delayed')
    assert.match(request.traceId, TRACE_ID)
    assert.equal(delayed!.traceId, request.traceId)
  })

  test('every workflow step keeps the trace of the request that started it', async () => {
    const request = await post('/trace/run')
    const [one, two] = await waitForHops('step-one', 'step-two')
    assert.match(request.traceId, TRACE_ID)
    assert.equal(one!.traceId, request.traceId)
    assert.equal(two!.traceId, request.traceId)
  })
})
