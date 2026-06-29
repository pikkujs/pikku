import React, {
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
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'

// ========== Public types ==========

export interface PikkuAgentRuntimeOptions {
  api: string
  agentName: string
  threadId: string
  resourceId: string
  initialMessages?: any[]
  onFinish?: () => void
  credentials?: RequestCredentials
  headers?: Record<string, string>
  model?: string
  temperature?: number
  /** Structured context injected into the agent's system instructions.
   *  Provide upfront state (e.g. current org/project/branch/deployment IDs)
   *  so the agent can call tools without asking the user. */
  context?: string
}

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId: string
  type?: 'approval-request' | 'credential-request'
  credentialName?: string
  credentialType?: 'oauth2' | 'apikey'
  connectUrl?: string
}

export interface PikkuApprovalContextValue {
  pendingApprovals: PendingApproval[]
  handleApproval: (toolCallId: string, approved: boolean) => void
}

export const PikkuApprovalContext = createContext<PikkuApprovalContextValue>({
  pendingApprovals: [],
  handleApproval: () => {},
})

export const usePikkuApproval = () => useContext(PikkuApprovalContext)

// ========== Utility functions ==========

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

// ========== PikkuAgent ==========

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

// ========== usePikkuAgentRuntime ==========

export function usePikkuAgentRuntime(options: PikkuAgentRuntimeOptions) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  )

  const onFinishRef = useRef(options.onFinish)
  onFinishRef.current = options.onFinish

  const agent = useMemo(
    () => new PikkuAgent(options),
    // agent is intentionally created once; opts are synced via updateOpts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  agent.updateOpts(options)

  useEffect(() => {
    const { unsubscribe } = agent.subscribe({
      onCustomEvent: ({ event }) => {
        const e = event as AgUiCustomEvent
        if (e.name === 'pikku:approval-request') {
          const v = e.value as any
          setPendingApprovals((prev) => [
            ...prev,
            {
              toolCallId: v.toolCallId,
              toolName: v.toolName,
              args: v.args,
              reason: v.reason,
              runId: v.runId ?? '',
              type: 'approval-request' as const,
            },
          ])
        } else if (e.name === 'pikku:credential-request') {
          const v = e.value as any
          setPendingApprovals((prev) => [
            ...prev,
            {
              toolCallId: v.toolCallId,
              toolName: v.toolName,
              args: v.args,
              runId: v.runId ?? '',
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
  }, [agent])

  const runtime = useAgUiRuntime({ agent })

  const handleApproval = useCallback(
    (toolCallId: string, approved: boolean) => {
      const approval = pendingApprovals.find((p) => p.toolCallId === toolCallId)
      if (!approval) return
      setPendingApprovals([])
      agent.queueResume({ runId: approval.runId, toolCallId, approved })
      agent.runAgent()
    },
    [agent, pendingApprovals]
  )

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval: pendingApprovals.length > 0,
    handleApproval,
  }
}

// ========== usePikkuAgentNonStreamingRuntime ==========

type ToolCall = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: string
  isError?: boolean
}

type StructuredPart =
  | { type: 'generative-ui'; spec: unknown }
  | { type: 'data'; name: string; data: unknown }

async function* parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>
) {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data) {
          try {
            yield JSON.parse(data)
          } catch {
            // skip unparseable lines
          }
        }
      }
    }
  }
}

async function processNonStreamingStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: { value: string },
  toolCalls: ToolCall[],
  structuredParts: StructuredPart[],
  yieldContent: () => void,
  onFinish?: () => void
): Promise<PendingApproval[]> {
  const pendingApprovals: PendingApproval[] = []

  for await (const event of parseSSEStream(reader)) {
    switch (event.type) {
      case 'text-delta':
        text.value += event.text
        break
      case 'tool-call': {
        let parsedArgs = event.args
        if (typeof event.args === 'string') {
          try {
            parsedArgs = JSON.parse(event.args)
          } catch {
            parsedArgs = {}
          }
        }
        toolCalls.push({
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: parsedArgs,
        })
        break
      }
      case 'tool-result': {
        const resultObj = typeof event.result === 'object' ? event.result : null
        if (resultObj && '__approvalRequired' in resultObj) {
          break
        }
        const tc = toolCalls.find((t) => t.toolCallId === event.toolCallId)
        if (tc) {
          tc.result =
            typeof event.result === 'string'
              ? event.result
              : JSON.stringify(event.result)
          if (event.isError) {
            tc.isError = true
          }
        }
        break
      }
      case 'generative-ui': {
        const nextPart = { type: 'generative-ui' as const, spec: event.spec }
        const existingIndex = structuredParts.findIndex(
          (part) => part.type === 'generative-ui'
        )
        if (existingIndex === -1) structuredParts.push(nextPart)
        else structuredParts[existingIndex] = nextPart
        break
      }
      case 'data': {
        const nextPart = {
          type: 'data' as const,
          name: event.name,
          data: event.data,
        }
        const existingIndex = structuredParts.findIndex(
          (part) => part.type === 'data' && part.name === event.name
        )
        if (existingIndex === -1) structuredParts.push(nextPart)
        else structuredParts[existingIndex] = nextPart
        break
      }
      case 'approval-request':
        pendingApprovals.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          reason: event.reason,
          runId: event.runId ?? '',
          type: 'approval-request',
        })
        break
      case 'credential-request':
        pendingApprovals.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          runId: event.runId,
          type: 'credential-request',
          credentialName: event.credentialName,
          credentialType: event.credentialType,
          connectUrl: event.connectUrl,
        })
        break
      case 'error':
        text.value += `\n\nError: ${event.message || event.errorText || 'Unknown error'}`
        break
      case 'done':
        onFinish?.()
        continue
    }
    yieldContent()
  }

  return pendingApprovals
}

function buildRichContent(
  text: { value: string },
  structuredParts: StructuredPart[],
  toolCalls: ToolCall[]
): any[] {
  const content: any[] = []
  if (text.value) content.push({ type: 'text' as const, text: text.value })
  content.push(...structuredParts)
  content.push(...toolCalls)
  return content
}

function buildContentFromAgentResult(result: unknown): any[] {
  const content: any[] = []
  if (typeof result === 'string') {
    if (result) content.push({ type: 'text' as const, text: result })
    return content
  }
  if (!result || typeof result !== 'object') return content
  const record = result as Record<string, unknown>
  if (typeof record.text === 'string' && record.text) {
    content.push({ type: 'text' as const, text: record.text })
  }
  if (record.ui != null) {
    content.push({ type: 'generative-ui' as const, spec: record.ui })
  }
  return content
}

function createPikkuNonStreamingAdapter(
  optionsRef: React.RefObject<PikkuAgentRuntimeOptions>,
  pendingApprovalsRef: React.RefObject<PendingApproval[]>,
  approvalDecisionsRef: React.RefObject<
    { toolCallId: string; approved: boolean }[]
  >,
  setPendingApprovalsRef: React.RefObject<
    (approvals: PendingApproval[]) => void
  >,
  onFinishRef: React.RefObject<(() => void) | undefined>
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const opts = optionsRef.current!

      const pendingApprovals = pendingApprovalsRef.current
      if (pendingApprovals.length > 0) {
        const decisions = approvalDecisionsRef.current
        approvalDecisionsRef.current = []

        if (decisions.length === 0) return

        pendingApprovalsRef.current = []
        setPendingApprovalsRef.current([])

        let lastText = { value: '' }
        let lastToolCalls: ToolCall[] = []
        let lastStructuredParts: StructuredPart[] = []
        let nextApprovals: PendingApproval[] = []

        for (let i = 0; i < decisions.length; i++) {
          const decision = decisions[i]
          const matchingApproval = pendingApprovals.find(
            (p) => p.toolCallId === decision.toolCallId
          )
          const runId = matchingApproval?.runId ?? pendingApprovals[0]?.runId

          const resumeResponse = await fetch(
            `${opts.api}/${opts.agentName}/resume`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...opts.headers,
              },
              body: JSON.stringify({
                runId,
                toolCallId: decision.toolCallId,
                approved: decision.approved,
              }),
              signal: abortSignal,
              credentials: opts.credentials,
            }
          )

          if (!resumeResponse.ok || !resumeResponse.body) {
            const errorText = resumeResponse.body
              ? await resumeResponse.text().catch(() => '')
              : ''
            throw new Error(
              `Resume failed: ${resumeResponse.status}${errorText ? ` - ${errorText}` : ''}`
            )
          }

          const text = { value: '' }
          const toolCalls: ToolCall[] = []
          const structuredParts: StructuredPart[] = []
          const reader = resumeResponse.body.getReader()
          const streamApprovals = await processNonStreamingStream(
            reader,
            text,
            toolCalls,
            structuredParts,
            () => {},
            i === decisions.length - 1
              ? (onFinishRef.current ?? undefined)
              : undefined
          )

          lastText = text
          lastToolCalls = toolCalls
          lastStructuredParts = structuredParts
          if (streamApprovals.length > 0) {
            nextApprovals = streamApprovals
          }
        }

        const content = buildRichContent(
          lastText,
          lastStructuredParts,
          lastToolCalls
        )

        if (nextApprovals.length > 0) {
          pendingApprovalsRef.current = nextApprovals
          setPendingApprovalsRef.current(nextApprovals)

          for (const approval of nextApprovals) {
            const approvalToolCall: ToolCall = {
              type: 'tool-call',
              toolCallId: approval.toolCallId,
              toolName: approval.toolName,
              args: {
                ...(typeof approval.args === 'object' && approval.args !== null
                  ? (approval.args as Record<string, unknown>)
                  : {}),
                ...(approval.reason
                  ? { __approvalReason: approval.reason }
                  : {}),
              },
            }
            const idx = lastToolCalls.findIndex(
              (tc) => tc.toolCallId === approval.toolCallId && !tc.result
            )
            if (idx !== -1) {
              lastToolCalls[idx] = approvalToolCall
            } else {
              lastToolCalls.push(approvalToolCall)
            }
          }

          const updatedContent = buildRichContent(
            lastText,
            lastStructuredParts,
            lastToolCalls
          )
          yield {
            content: updatedContent,
            status: {
              type: 'requires-action' as const,
              reason: 'tool-calls' as const,
            },
          }
        } else if (content.length > 0) {
          yield { content }
        }
        return
      }

      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
      if (!lastUserMsg) return

      let messageText = ''
      if (lastUserMsg.content) {
        for (const part of lastUserMsg.content) {
          if ('text' in part && part.type === 'text') {
            messageText += (part as { text: string }).text
          }
        }
      }

      const response = await fetch(`${opts.api}/${opts.agentName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify({
          agentName: opts.agentName,
          message: messageText,
          threadId: opts.threadId,
          resourceId: opts.resourceId,
          model: opts.model,
          temperature: opts.temperature,
          ...(opts.context ? { context: opts.context } : {}),
        }),
        signal: abortSignal,
        credentials: opts.credentials,
      })

      if (!response.ok) {
        throw new Error(`Agent run failed: ${response.status}`)
      }

      const json = await response.json()

      if (json.status === 'suspended' && json.pendingApprovals?.length > 0) {
        const approvals: PendingApproval[] = json.pendingApprovals
        pendingApprovalsRef.current = approvals
        setPendingApprovalsRef.current(approvals)

        const toolCalls: ToolCall[] = approvals.map((approval) => ({
          type: 'tool-call' as const,
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          args: {
            ...(typeof approval.args === 'object' && approval.args !== null
              ? (approval.args as Record<string, unknown>)
              : {}),
            ...(approval.reason ? { __approvalReason: approval.reason } : {}),
          },
        }))

        const content: any[] = []
        content.push(...buildContentFromAgentResult(json.result))
        content.push(...toolCalls)

        yield {
          content,
          status: {
            type: 'requires-action' as const,
            reason: 'tool-calls' as const,
          },
        }
        return
      }

      onFinishRef.current?.()
      const content = buildContentFromAgentResult(json.result)
      if (content.length > 0) {
        yield { content }
      }
    },
  }
}

export function usePikkuAgentNonStreamingRuntime(
  options: PikkuAgentRuntimeOptions
) {
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>(
    []
  )

  const optionsRef = useRef(options)
  optionsRef.current = options

  const onFinishRef = useRef(options.onFinish)
  onFinishRef.current = options.onFinish

  const pendingApprovalsRef = useRef<PendingApproval[]>([])
  const approvalDecisionsRef = useRef<
    { toolCallId: string; approved: boolean }[]
  >([])

  const setPendingApprovalsRef = useRef(setPendingApprovals)
  setPendingApprovalsRef.current = setPendingApprovals

  const adapter = useMemo(
    () =>
      createPikkuNonStreamingAdapter(
        optionsRef,
        pendingApprovalsRef,
        approvalDecisionsRef,
        setPendingApprovalsRef,
        onFinishRef
      ),
    []
  )

  const initialMessages = useMemo(
    () =>
      options.initialMessages
        ? convertDbMessages(options.initialMessages)
        : undefined,
    [options.initialMessages]
  )

  const runtime = useLocalRuntime(adapter, { initialMessages })

  const handleApproval = useCallback(
    (toolCallId: string, approved: boolean) => {
      approvalDecisionsRef.current.push({ toolCallId, approved })
    },
    []
  )

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval: pendingApprovals.length > 0,
    handleApproval,
  }
}
