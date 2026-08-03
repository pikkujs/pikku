import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { HttpAgent } from '@ag-ui/client'
import type {
  RunAgentInput,
  BaseEvent,
  CustomEvent as AgUiCustomEvent,
} from '@ag-ui/client'
import type { Observable } from 'rxjs'
import { useAgUiRuntime } from '@assistant-ui/react-ag-ui'
import {
  ExportedMessageRepository,
  type ThreadMessageLike,
  type ThreadHistoryAdapter,
} from '@assistant-ui/react'

export interface PikkuAgentRuntimeOptions {
  api: string
  agentName: string
  threadId: string
  resourceId: string
  onFinish?: () => void
  credentials?: RequestCredentials
  headers?: Record<string, string>
  model?: string
  temperature?: number
  /** Structured context injected into the agent's system instructions.
   *  Provide upfront state (e.g. current org/project/branch/deployment IDs)
   *  so the agent can call tools without asking the user. */
  context?: string
  /** Prior messages to hydrate the thread with (e.g. converted from persisted
   *  DB history via `convertDbMessages`). Loaded once on mount, so the
   *  consumer must keep the chat unmounted until these are available (key or
   *  gate on load) — the runtime does not re-hydrate when they change later. */
  initialMessages?: ThreadMessageLike[]
}

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId?: string
  type?: 'approval-request' | 'credential-request'
  credentialName?: string
  credentialType?: 'oauth2' | 'apikey'
  connectUrl?: string
}

export interface PikkuApprovalContextValue {
  pendingApprovals: PendingApproval[]
  /** Resolve an approval/credential request. Returns `true` when the request
   *  was found and acknowledged — callers must gate their `addResult` call on
   *  this so a stray result can't start a resume run with nothing queued. */
  handleApproval: (toolCallId: string, approved: boolean) => Promise<boolean>
}

export const PikkuApprovalContext = createContext<PikkuApprovalContextValue>({
  pendingApprovals: [],
  handleApproval: async () => false,
})

export const usePikkuApproval = () => useContext(PikkuApprovalContext)

export function isDeniedResult(result: unknown): boolean {
  if (result == null) return false
  try {
    const parsed = typeof result === 'string' ? JSON.parse(result) : result
    return parsed && typeof parsed === 'object' && parsed.approved === false
  } catch {
    return false
  }
}

export type PikkuToolStatusType =
  | 'running'
  | 'requires-action'
  | 'completed'
  | 'denied'
  | 'error'
  | 'missing-credential'

export type MissingCredentialPayload = {
  error: 'missing_credential'
  credentialName: string
  credentialType: 'oauth2' | 'apikey'
  connectUrl?: string
}

export type PikkuToolStatus =
  | { type: Exclude<PikkuToolStatusType, 'missing-credential'> }
  | { type: 'missing-credential'; payload: MissingCredentialPayload }

function isMissingCredentialResult(
  result: unknown
): MissingCredentialPayload | null {
  if (
    typeof result === 'object' &&
    result &&
    (result as any).error === 'missing_credential'
  ) {
    return result as MissingCredentialPayload
  }
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result)
      if (parsed?.error === 'missing_credential') return parsed
    } catch {}
  }
  return null
}

export function resolvePikkuToolStatus(
  status: { type: string },
  result?: unknown
): PikkuToolStatus {
  if (status.type === 'running') return { type: 'running' }
  if (status.type === 'requires-action') return { type: 'requires-action' }
  if (isDeniedResult(result)) return { type: 'denied' }
  const missingCred = isMissingCredentialResult(result)
  if (missingCred) return { type: 'missing-credential', payload: missingCred }
  if (typeof result === 'string' && result.startsWith('Error:'))
    return { type: 'error' }
  return { type: 'completed' }
}

export const convertDbMessages = (dbMessages: any[]): ThreadMessageLike[] => {
  const result: ThreadMessageLike[] = []
  let currentAssistant: ThreadMessageLike | null = null

  for (const msg of dbMessages) {
    if (msg.role === 'user') {
      if (currentAssistant) {
        result.push(currentAssistant)
        currentAssistant = null
      }
      result.push({
        role: 'user',
        content: msg.content || '',
        id: msg.id,
        createdAt: new Date(msg.createdAt),
      })
      continue
    }

    if (
      msg.role === 'tool' &&
      currentAssistant &&
      Array.isArray(msg.toolResults)
    ) {
      const parts: any[] = Array.isArray(currentAssistant.content)
        ? [...(currentAssistant.content as any[])]
        : currentAssistant.content
          ? [
              {
                type: 'text' as const,
                text: currentAssistant.content as string,
              },
            ]
          : []

      for (const tr of msg.toolResults) {
        const tcIdx = parts.findIndex(
          (p: any) => p.type === 'tool-call' && p.toolCallId === tr.id
        )
        if (tcIdx !== -1) {
          parts[tcIdx] = {
            ...parts[tcIdx],
            result:
              typeof tr.result === 'string'
                ? tr.result
                : JSON.stringify(tr.result),
          }
        }
      }

      currentAssistant = {
        role: currentAssistant.role,
        id: currentAssistant.id,
        createdAt: currentAssistant.createdAt,
        status: currentAssistant.status,
        content: parts,
      }
      continue
    }

    if (msg.role === 'tool') continue

    const parts: any[] = []

    if (msg.content) {
      if (Array.isArray(msg.content)) {
        parts.push(...msg.content)
      } else {
        parts.push({ type: 'text' as const, text: msg.content })
      }
    }

    if (Array.isArray(msg.toolCalls)) {
      for (const tc of msg.toolCalls) {
        parts.push({
          type: 'tool-call' as const,
          toolCallId: tc.id,
          toolName: tc.name,
          args: tc.args || {},
        })
      }
    }

    if (currentAssistant) {
      const prev = currentAssistant.content
      const existingParts: any[] = Array.isArray(prev)
        ? [...prev]
        : prev
          ? [{ type: 'text' as const, text: prev as string }]
          : []
      currentAssistant = {
        role: currentAssistant.role,
        id: currentAssistant.id,
        createdAt: currentAssistant.createdAt,
        status: currentAssistant.status,
        content: [...existingParts, ...parts],
      }
    } else {
      currentAssistant = {
        role: 'assistant' as const,
        content: parts.length > 0 ? parts : '',
        id: msg.id,
        createdAt: new Date(msg.createdAt),
        status: { type: 'complete' as const, reason: 'stop' as const },
      }
    }
  }

  if (currentAssistant) {
    result.push(currentAssistant)
  }

  return result
}

type PendingResume = {
  runId: string
  toolCallId: string
  approved: boolean
}

/**
 * A spoken turn waiting to be sent as the next run.
 *
 * `marker` is the text the thread's user message was appended with, and it
 * exists because of an ordering problem: the run has to start before anyone
 * knows what the user said, since the transcription happens on the server. So
 * the message goes into the thread as this marker, is rendered as the
 * transcript once `pikku:transcript` arrives, and is swapped for an empty
 * `message` here so the marker itself never leaves the browser — a model asked
 * to answer `⟦voice:3⟧` would try.
 */
type PendingVoiceTurn = {
  marker: string
  mediaType: string
  /** base64, no data-URL prefix. */
  data: string
}

/** Prefix of the placeholder text a spoken turn is appended with. Private to
 *  this package — see {@link PendingVoiceTurn}. */
export const VOICE_MARKER_PREFIX = '⸢voice:'

export const isVoiceMarker = (text: string): boolean =>
  text.startsWith(VOICE_MARKER_PREFIX)

function extractLastUserMessage(messages: RunAgentInput['messages']): string {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser) return ''
  const content = lastUser.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p.type === 'text')
      .map((p: any) => (p.text as string) ?? '')
      .join('')
  }
  return ''
}

class PikkuAgent extends HttpAgent {
  private pikkuOpts: PikkuAgentRuntimeOptions
  private _pendingResume: PendingResume | null = null
  private _currentResume: PendingResume | null = null
  private _pendingVoice: PendingVoiceTurn | null = null
  private _currentVoice: PendingVoiceTurn | null = null

  constructor(opts: PikkuAgentRuntimeOptions) {
    super({
      url: `${opts.api}/${opts.agentName}/stream`,
      threadId: opts.threadId,
    })
    this.pikkuOpts = opts
  }

  updateOpts(opts: PikkuAgentRuntimeOptions) {
    this.pikkuOpts = opts
  }

  queueResume(data: PendingResume) {
    this._pendingResume = data
  }

  queueVoiceTurn(turn: PendingVoiceTurn) {
    this._pendingVoice = turn
  }

  /** The marker of the spoken turn this run is answering, if it is one. Read by
   *  the runtime to attach an incoming transcript to the right message. */
  get currentVoiceMarker(): string | null {
    return this._currentVoice?.marker ?? null
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    const resume = this._pendingResume
    this._pendingResume = null
    this._currentResume = resume
    this._currentVoice = this._pendingVoice
    this._pendingVoice = null
    this.url = resume
      ? `${this.pikkuOpts.api}/${this.pikkuOpts.agentName}/resume`
      : `${this.pikkuOpts.api}/${this.pikkuOpts.agentName}/stream`
    return super.run(input)
  }

  protected requestInit(input: RunAgentInput): RequestInit {
    const base = super.requestInit(input)
    const resume = this._currentResume
    const opts = this.pikkuOpts
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...opts.headers,
    }

    if (resume) {
      return {
        ...base,
        headers,
        credentials: opts.credentials,
        body: JSON.stringify(resume),
      }
    }

    const voice = this._currentVoice
    // The marker is a rendering placeholder, not something the user said, so a
    // spoken turn is sent as audio with no text at all — the server's
    // `voiceInput` middleware puts the transcript in its place.
    const message = voice ? '' : extractLastUserMessage(input.messages)

    return {
      ...base,
      headers,
      credentials: opts.credentials,
      body: JSON.stringify({
        agentName: opts.agentName,
        message,
        ...(voice
          ? {
              attachments: [
                {
                  type: 'file' as const,
                  mediaType: voice.mediaType,
                  data: voice.data,
                },
              ],
            }
          : {}),
        threadId: opts.threadId,
        resourceId: opts.resourceId,
        model: opts.model,
        temperature: opts.temperature,
        ...(opts.context ? { context: opts.context } : {}),
      }),
    }
  }
}

export interface PikkuVoiceEvents {
  /** A base64 chunk of the agent's speech, the format it is in, and the
   *  sentence it says. */
  onAudio?: (chunk: { data: string; format: string; text?: string }) => void
  /** The agent has finished speaking this reply. */
  onAudioDone?: () => void
}

export function usePikkuAgentRuntime(
  options: PikkuAgentRuntimeOptions,
  voice?: PikkuVoiceEvents
) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  )
  // What the server heard, keyed by the marker of the message it belongs to.
  // Rendering reads this; nothing else does — see PendingVoiceTurn.
  const [transcripts, setTranscripts] = useState<Record<string, string>>({})
  // Authoritative pending list, mutated synchronously so two approval clicks
  // in the same tick can't both read a stale "remaining" and skip the resume.
  // State mirrors it purely for rendering.
  const pendingApprovalsRef = useRef<PendingApproval[]>([])
  const commitPending = useCallback((next: PendingApproval[]) => {
    pendingApprovalsRef.current = next
    setPendingApprovals(next)
  }, [])

  const onFinishRef = useRef(options.onFinish)
  onFinishRef.current = options.onFinish

  // Held in a ref so a caller can pass fresh closures every render without
  // resubscribing the agent — which would drop events mid-reply.
  const voiceRef = useRef(voice)
  voiceRef.current = voice

  const agent = useMemo(
    () => new PikkuAgent(options),
    // agent is intentionally created once; opts are synced via updateOpts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useEffect(() => {
    agent.updateOpts(options)
  })

  useEffect(() => {
    const { unsubscribe } = agent.subscribe({
      onCustomEvent: ({ event }) => {
        const e = event as AgUiCustomEvent
        if (e.name === 'pikku:approval-request') {
          const v = e.value as any
          commitPending([
            ...pendingApprovalsRef.current,
            {
              toolCallId: v.toolCallId,
              toolName: v.toolName,
              args: v.args,
              reason: v.reason,
              runId: v.runId,
              type: 'approval-request' as const,
            },
          ])
        } else if (e.name === 'pikku:credential-request') {
          const v = e.value as any
          commitPending([
            ...pendingApprovalsRef.current,
            {
              toolCallId: v.toolCallId,
              toolName: v.toolName,
              args: v.args,
              runId: v.runId,
              type: 'credential-request' as const,
              credentialName: v.credentialName,
              credentialType: v.credentialType,
              connectUrl: v.connectUrl,
            },
          ])
        } else if (e.name === 'pikku:transcript') {
          const marker = agent.currentVoiceMarker
          if (marker) {
            const text = (e.value as { text?: string })?.text ?? ''
            setTranscripts((prev) => ({ ...prev, [marker]: text }))
          }
        } else if (e.name === 'pikku:audio-delta') {
          const v = e.value as { data: string; format: string; text?: string }
          voiceRef.current?.onAudio?.(v)
        } else if (e.name === 'pikku:audio-done') {
          voiceRef.current?.onAudioDone?.()
        }
      },
      onRunFinalized: () => {
        onFinishRef.current?.()
      },
    })
    return unsubscribe
  }, [agent, commitPending])

  // Hydrate the thread from prior messages via the AG-UI history adapter,
  // which useAgUiRuntime loads once on mount. Built once — see the
  // initialMessages doc note about keeping the chat unmounted until ready.
  const history = useMemo<ThreadHistoryAdapter | undefined>(() => {
    if (!options.initialMessages?.length) return undefined
    const repository = ExportedMessageRepository.fromArray(
      options.initialMessages
    )
    return {
      load: async () => repository,
      append: async () => {},
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const runtime = useAgUiRuntime(
    history ? { agent, adapters: { history } } : { agent }
  )

  const optionsRef = useRef(options)
  optionsRef.current = options
  const resumeChainRef = useRef<Promise<void>>(Promise.resolve())

  // The runtime only aggregates events from runs it starts itself, so the
  // final approval is queued on the agent and triggered by the caller's
  // addResult (which makes the runtime start the resume run once every tool
  // call has a result). Earlier approvals in a batch are acknowledged with
  // plain requests — their stream carries no content beyond 'done'.
  const handleApproval = useCallback(
    async (toolCallId: string, approved: boolean): Promise<boolean> => {
      const approval = pendingApprovalsRef.current.find(
        (p) => p.toolCallId === toolCallId
      )
      if (!approval || !approval.runId) return false
      const remaining = pendingApprovalsRef.current.filter(
        (p) => p.toolCallId !== toolCallId
      )
      commitPending(remaining)
      const resume = { runId: approval.runId, toolCallId, approved }

      if (remaining.length > 0) {
        resumeChainRef.current = resumeChainRef.current.then(async () => {
          const opts = optionsRef.current
          try {
            const response = await fetch(
              `${opts.api}/${opts.agentName}/resume`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Accept: 'text/event-stream',
                  ...opts.headers,
                },
                credentials: opts.credentials,
                body: JSON.stringify(resume),
              }
            )
            await response.text()
          } catch (err) {
            console.error('[pikku] failed to resolve approval', err)
          }
        })
        await resumeChainRef.current
        return true
      }

      await resumeChainRef.current
      agent.queueResume(resume)
      return true
    },
    [agent, commitPending]
  )

  /**
   * Send a recorded turn. Appends a placeholder user message, which starts the
   * run, and returns the marker that message carries so the caller can leave
   * the rendering of it to {@link transcripts}.
   */
  const sendVoiceTurn = useCallback(
    async (audio: Blob) => {
      const marker = `${VOICE_MARKER_PREFIX}${Date.now().toString(36)}⸣`
      const buffer = await audio.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      // Chunked: `String.fromCharCode(...bytes)` on a several-hundred-kilobyte
      // clip is an argument list long enough to overflow the call stack.
      const CHUNK = 0x8000
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
      }
      agent.queueVoiceTurn({
        marker,
        mediaType: audio.type || 'audio/webm',
        data: btoa(binary),
      })
      await runtime.thread.append({
        role: 'user',
        content: [{ type: 'text', text: marker }],
      })
      return marker
    },
    [agent, runtime]
  )

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval: pendingApprovals.length > 0,
    handleApproval,
    sendVoiceTurn,
    transcripts,
  }
}
