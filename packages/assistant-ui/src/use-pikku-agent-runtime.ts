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

  run(input: RunAgentInput): Observable<BaseEvent> {
    const resume = this._pendingResume
    this._pendingResume = null
    this._currentResume = resume
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

    return {
      ...base,
      headers,
      credentials: opts.credentials,
      body: JSON.stringify({
        agentName: opts.agentName,
        message: extractLastUserMessage(input.messages),
        threadId: opts.threadId,
        resourceId: opts.resourceId,
        model: opts.model,
        temperature: opts.temperature,
        ...(opts.context ? { context: opts.context } : {}),
      }),
    }
  }
}

export function usePikkuAgentRuntime(options: PikkuAgentRuntimeOptions) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  )
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

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval: pendingApprovals.length > 0,
    handleApproval,
  }
}
