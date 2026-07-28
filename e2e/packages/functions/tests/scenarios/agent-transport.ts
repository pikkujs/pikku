/**
 * Raw HTTP transport for the deterministic agent scenarios.
 *
 * These are plain helpers, not steps — the steps in `agent-run.steps.ts` and
 * `agent-assert.steps.ts` are the only things a scenario names.
 *
 * Why raw fetch rather than a scenario actor: these scenarios exercise
 * `setSessionFromHeader` in `e2e/src/middleware.ts`, which reads `x-user-id` /
 * `x-org-id` after the better-auth middleware and overwrites the session. The
 * principals they need (`outsider`, `mallory`, `permitted-user`, `orgless-user`)
 * have no seeded account at all, so there is no actor to be. Identity is
 * therefore step *data* here, and only here.
 */
import {
  readScenarioHttpResponse,
  type ScenarioHttpResponse,
} from '@pikku/core/workflow'
import type { MockLlmCall } from '../../src/mock-llm/provider.js'

export type { MockLlmCall }

/**
 * The principal a call runs as. Absent fields mean the header is not sent,
 * which is how a genuinely sessionless call is expressed.
 */
export type Identity = { userId?: string; orgId?: string }

export const identityHeaders = (
  identity: Identity = {}
): Record<string, string> => ({
  ...(identity.userId ? { 'x-user-id': identity.userId } : {}),
  ...(identity.orgId ? { 'x-org-id': identity.orgId } : {}),
})

/**
 * The agent stream speaks AG-UI, so these are the wire names — not the
 * lower-case `text-delta` vocabulary the AI SDK uses internally.
 */
export const AG_UI = {
  runStarted: 'RUN_STARTED',
  runFinished: 'RUN_FINISHED',
  runError: 'RUN_ERROR',
  stepStarted: 'STEP_STARTED',
  stepFinished: 'STEP_FINISHED',
  textStart: 'TEXT_MESSAGE_START',
  textContent: 'TEXT_MESSAGE_CONTENT',
  textEnd: 'TEXT_MESSAGE_END',
  toolCallStart: 'TOOL_CALL_START',
  toolCallArgs: 'TOOL_CALL_ARGS',
  toolCallEnd: 'TOOL_CALL_END',
  toolCallResult: 'TOOL_CALL_RESULT',
} as const

export type StreamEvent = { type: string; [key: string]: unknown }

/**
 * What the transport answered. The same record `actor.invokeRaw` returns, so a
 * scenario reads a header-shim call and an actor call the same way.
 */
/**
 * POSTs to an agent's sync route as a given principal.
 *
 * Never throws on a non-2xx: a refusal is the expected outcome in twelve of
 * these scenarios, so status is data the assertion steps read.
 */
export const postAgent = async (
  apiUrl: string,
  agent: string,
  identity: Identity,
  body: Record<string, unknown>
): Promise<ScenarioHttpResponse> =>
  readScenarioHttpResponse(
    await fetch(`${apiUrl}/rpc/agent/${agent}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders(identity),
      },
      body: JSON.stringify(body),
    })
  )

/**
 * POSTs a batch of approval decisions to an agent's approve route.
 *
 * A separate route from the run itself, so it is a separate helper rather than
 * a flag on `postAgent`.
 */
export const postAgentApproval = async (
  apiUrl: string,
  agent: string,
  identity: Identity,
  body: Record<string, unknown>
): Promise<ScenarioHttpResponse> =>
  readScenarioHttpResponse(
    await fetch(`${apiUrl}/rpc/agent/${agent}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders(identity),
      },
      body: JSON.stringify(body),
    })
  )

/** Calls an exposed RPC as a given principal. */
export const postRpc = async (
  apiUrl: string,
  rpcName: string,
  identity: Identity,
  data: Record<string, unknown>
): Promise<ScenarioHttpResponse> =>
  readScenarioHttpResponse(
    await fetch(`${apiUrl}/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...identityHeaders(identity),
      },
      body: JSON.stringify({ rpcName, data }),
    })
  )

/**
 * POSTs to an agent's SSE route and drains the whole response.
 *
 * Reads to completion rather than exposing an incremental `waitForEvent`: every
 * assertion here is about the finished sequence, and a scripted model closes
 * the stream promptly, so draining avoids per-event timeout flake.
 */
export const postAgentStream = async (
  apiUrl: string,
  agent: string,
  identity: Identity,
  body: Record<string, unknown>
): Promise<{ status: number; events: StreamEvent[] }> => {
  const res = await fetch(`${apiUrl}/rpc/agent/${agent}/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      accept: 'text/event-stream',
      ...identityHeaders(identity),
    },
    body: JSON.stringify(body),
  })

  if (!res.body) {
    return { status: res.status, events: [] }
  }

  const raw = await res.text()
  const events: StreamEvent[] = []

  for (const block of raw.split('\n\n')) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('')
    if (!data || data === '[DONE]') continue
    try {
      events.push(JSON.parse(data) as StreamEvent)
    } catch {
      // Non-JSON keep-alive or comment frame — not an event.
    }
  }

  return { status: res.status, events }
}

/** The whole process-global mock LLM call log, oldest first. */
export const readModelCalls = async (
  apiUrl: string
): Promise<MockLlmCall[]> => {
  const { body } = await postRpc(apiUrl, 'llmCallLog', {}, {})
  return Array.isArray(body) ? (body as MockLlmCall[]) : []
}
