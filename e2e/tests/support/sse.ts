import type { Actor } from '@pikku/cucumber'
import { config } from './types.js'

export type StreamEvent = { type: string; [key: string]: unknown }

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

/**
 * Collected result of an agent stream. Ordering matters as much as content —
 * `step-start` before any `text-delta`, `tool-call` before its `tool-result` —
 * so the raw sequence is kept rather than only a bag of events.
 */
export class StreamRecording {
  constructor(
    readonly events: StreamEvent[],
    readonly status: number
  ) {}

  ofType(type: string): StreamEvent[] {
    return this.events.filter((e) => e.type === type)
  }

  first(type: string): StreamEvent | undefined {
    return this.events.find((e) => e.type === type)
  }

  types(): string[] {
    return this.events.map((e) => e.type)
  }

  indexOf(type: string): number {
    return this.events.findIndex((e) => e.type === type)
  }

  /** Concatenated text, which should match what the sync route returns. */
  text(): string {
    return this.ofType(AG_UI.textContent)
      .map((e) => (e.delta ?? '') as string)
      .join('')
  }
}

/**
 * POSTs to an agent's SSE route and drains the whole response.
 *
 * Reads to completion rather than exposing an incremental `waitForEvent`: every
 * Phase 0 assertion is about the finished sequence, and a scripted model closes
 * the stream promptly, so draining avoids per-event timeout flake.
 */
export const streamAgent = async (
  actor: Actor,
  agentName: string,
  body: Record<string, unknown>
): Promise<StreamRecording> => {
  const res = await actor.cookieFetch(
    `${config.apiUrl}/rpc/agent/${agentName}/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    }
  )

  if (!res.body) {
    return new StreamRecording([], res.status)
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

  return new StreamRecording(events, res.status)
}

export const callAgent = async (
  actor: Actor,
  agentName: string,
  body: Record<string, unknown>
): Promise<{ status: number; body: any }> => {
  const res = await actor.cookieFetch(
    `${config.apiUrl}/rpc/agent/${agentName}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  )
  const text = await res.text()
  try {
    return { status: res.status, body: JSON.parse(text) }
  } catch {
    return { status: res.status, body: text }
  }
}
