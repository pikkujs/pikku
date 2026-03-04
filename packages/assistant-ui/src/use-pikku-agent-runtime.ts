import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react'
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'

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
}

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId: string
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

type ToolCall = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: string
  isError?: boolean
}

/**
 * Shared helper: consume an SSE stream and populate text/toolCalls.
 * Returns an array of PendingApprovals when the stream requests them, or empty when done.
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: { value: string },
  toolCalls: ToolCall[],
  yieldContent: () => void,
  onFinish?: () => void
): Promise<PendingApproval[]> {
  const pendingApprovals: PendingApproval[] = []

  for await (const event of parseSSEStream(reader)) {
    switch (event.type) {
      case 'text-delta':
        text.value += event.text
        break
      case 'tool-call':
        toolCalls.push({
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args:
            typeof event.args === 'string'
              ? JSON.parse(event.args)
              : event.args,
        })
        break
      case 'tool-result': {
        // Skip tool-results that contain __approvalRequired
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
      case 'approval-request':
        pendingApprovals.push({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          reason: event.reason,
          runId: event.runId,
        })
        break
      case 'done':
        onFinish?.()
        continue
    }
    yieldContent()
  }

  return pendingApprovals
}

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

export type PikkuToolStatus = { type: PikkuToolStatusType }

export function resolvePikkuToolStatus(
  status: { type: string },
  result?: unknown
): PikkuToolStatus {
  if (status.type === 'running') return { type: 'running' }
  if (status.type === 'requires-action') return { type: 'requires-action' }
  if (isDeniedResult(result)) return { type: 'denied' }
  if (typeof result === 'string' && result.startsWith('Error:'))
    return { type: 'error' }
  return { type: 'completed' }
}

function buildContent(text: { value: string }, toolCalls: ToolCall[]): any[] {
  const content: any[] = []
  if (text.value) content.push({ type: 'text' as const, text: text.value })
  content.push(...toolCalls)
  return content
}

function createPikkuStreamingAdapter(
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

      // Check if this run() is a continuation after approval decisions.
      // assistant-ui calls run() again after addResult provides tool results for ALL tool calls.
      const pendingApprovals = pendingApprovalsRef.current
      if (pendingApprovals.length > 0) {
        // Read the decisions accumulated by handleApproval() from click handlers.
        const decisions = approvalDecisionsRef.current
        approvalDecisionsRef.current = []

        if (decisions.length === 0) {
          // No decisions set — shouldn't happen if composer is disabled.
          return
        }

        // Clear pending approvals state
        pendingApprovalsRef.current = []
        setPendingApprovalsRef.current([])

        // Send /resume for each decision sequentially.
        // All but the last resume will return quickly (just tool-result + done).
        // The last resume triggers continuation (next LLM step).
        let lastText = { value: '' }
        let lastToolCalls: ToolCall[] = []
        let nextApprovals: PendingApproval[] = []

        for (let i = 0; i < decisions.length; i++) {
          const decision = decisions[i]
          // Find the runId from the matching pending approval
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
            continue
          }

          const text = { value: '' }
          const toolCalls: ToolCall[] = []
          const reader = resumeResponse.body.getReader()
          const streamApprovals = await processStream(
            reader,
            text,
            toolCalls,
            () => {},
            i === decisions.length - 1
              ? (onFinishRef.current ?? undefined)
              : undefined
          )

          // Keep the last resume's output (it has continuation content)
          lastText = text
          lastToolCalls = toolCalls
          if (streamApprovals.length > 0) {
            nextApprovals = streamApprovals
          }
        }

        // Build content from the last resume's output
        const content = buildContent(lastText, lastToolCalls)

        if (nextApprovals.length > 0) {
          // More approvals from continuation — show them
          pendingApprovalsRef.current = nextApprovals
          setPendingApprovalsRef.current(nextApprovals)

          // Add approval tool calls to content
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

          const updatedContent = buildContent(lastText, lastToolCalls)
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

      // Normal flow: new user message → stream
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

      const response = await fetch(`${opts.api}/${opts.agentName}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        body: JSON.stringify({
          agentName: opts.agentName,
          message: messageText,
          threadId: opts.threadId,
          resourceId: opts.resourceId,
          model: opts.model,
          temperature: opts.temperature,
        }),
        signal: abortSignal,
        credentials: opts.credentials,
      })

      if (!response.ok || !response.body) {
        throw new Error(`Agent stream failed: ${response.status}`)
      }

      const text = { value: '' }
      const toolCalls: ToolCall[] = []
      let pendingContent: any[] | null = null
      const yieldContent = () => {
        const content = buildContent(text, toolCalls)
        if (content.length > 0) pendingContent = content
      }

      const reader = response.body.getReader()
      const approvals = await processStream(
        reader,
        text,
        toolCalls,
        yieldContent,
        onFinishRef.current ?? undefined
      )

      if (approvals.length === 0) {
        // No approval needed — yield final content and done
        if (pendingContent) {
          yield { content: pendingContent }
        }
        return
      }

      // Approvals requested: store them for the next run() call
      pendingApprovalsRef.current = approvals
      setPendingApprovalsRef.current(approvals)

      // Each approval tool call needs to be shown without a result
      // so assistant-ui renders them as requires-action
      for (const approval of approvals) {
        const approvalToolCall: ToolCall = {
          type: 'tool-call',
          toolCallId: approval.toolCallId,
          toolName: approval.toolName,
          args: {
            ...(typeof approval.args === 'object' && approval.args !== null
              ? (approval.args as Record<string, unknown>)
              : {}),
            ...(approval.reason ? { __approvalReason: approval.reason } : {}),
          },
        }

        // Replace the existing tool call (if any) with the approval version
        const parentIdx = toolCalls.findIndex(
          (tc) => tc.toolCallId === approval.toolCallId && !tc.result
        )
        if (parentIdx !== -1) {
          toolCalls[parentIdx] = approvalToolCall
        } else {
          toolCalls.push(approvalToolCall)
        }
      }

      // Remove any forwarded sub-agent tool calls that duplicate approval tool names
      const approvalToolCallIds = new Set(approvals.map((a) => a.toolCallId))
      const approvalToolNames = new Set(approvals.map((a) => a.toolName))
      for (let i = toolCalls.length - 1; i >= 0; i--) {
        if (
          approvalToolNames.has(toolCalls[i].toolName) &&
          !approvalToolCallIds.has(toolCalls[i].toolCallId)
        ) {
          toolCalls.splice(i, 1)
        }
      }

      const content = buildContent(text, toolCalls)
      yield {
        content,
        status: {
          type: 'requires-action' as const,
          reason: 'tool-calls' as const,
        },
      }
      // Generator returns here. assistant-ui will show the approval UI for each tool call.
      // When the user clicks Approve/Deny on ALL tools → handleApproval accumulates decisions →
      // addResult for each → run() is called again when all have results.
    },
  }
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
      parts.push({ type: 'text' as const, text: msg.content })
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

export function usePikkuAgentRuntime(options: PikkuAgentRuntimeOptions) {
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
      createPikkuStreamingAdapter(
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

  // handleApproval is called from the Approve/Deny button click handler.
  // It accumulates the decision in the ref. assistant-ui will call run()
  // when ALL tool calls have results (via addResult).
  const handleApproval = useCallback(
    (toolCallId: string, approved: boolean) => {
      approvalDecisionsRef.current.push({ toolCallId, approved })
    },
    []
  )

  const isAwaitingApproval = pendingApprovals.length > 0

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval,
    handleApproval,
  }
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

      // Continuation after approval decisions
      const pendingApprovals = pendingApprovalsRef.current
      if (pendingApprovals.length > 0) {
        const decisions = approvalDecisionsRef.current
        approvalDecisionsRef.current = []

        if (decisions.length === 0) return

        pendingApprovalsRef.current = []
        setPendingApprovalsRef.current([])

        // Resume uses SSE (same as streaming mode)
        let lastText = { value: '' }
        let lastToolCalls: ToolCall[] = []
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

          if (!resumeResponse.ok || !resumeResponse.body) continue

          const text = { value: '' }
          const toolCalls: ToolCall[] = []
          const reader = resumeResponse.body.getReader()
          const streamApprovals = await processStream(
            reader,
            text,
            toolCalls,
            () => {},
            i === decisions.length - 1
              ? (onFinishRef.current ?? undefined)
              : undefined
          )

          lastText = text
          lastToolCalls = toolCalls
          if (streamApprovals.length > 0) {
            nextApprovals = streamApprovals
          }
        }

        const content = buildContent(lastText, lastToolCalls)

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

          const updatedContent = buildContent(lastText, lastToolCalls)
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

      // Normal flow: new user message → non-streaming POST
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
        if (json.result) {
          content.push({ type: 'text' as const, text: json.result })
        }
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

      // No approvals — yield complete content
      onFinishRef.current?.()
      const content: any[] = []
      if (json.result) {
        content.push({ type: 'text' as const, text: String(json.result) })
      }
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

  const isAwaitingApproval = pendingApprovals.length > 0

  return {
    runtime,
    pendingApprovals,
    isAwaitingApproval,
    handleApproval,
  }
}
