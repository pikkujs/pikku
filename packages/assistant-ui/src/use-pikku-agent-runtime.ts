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
}

export interface PendingApproval {
  toolCallId: string
  toolName: string
  args: unknown
  reason?: string
  runId: string
}

export interface PikkuApprovalContextValue {
  pendingApproval: PendingApproval | null
  handleApproval: (approved: boolean) => Promise<void>
}

export const PikkuApprovalContext = createContext<PikkuApprovalContextValue>({
  pendingApproval: null,
  handleApproval: async () => {},
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
 * Returns a PendingApproval when the stream requests one, or null when done.
 */
async function processStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  text: { value: string },
  toolCalls: ToolCall[],
  yieldContent: () => void,
  onFinish?: () => void
): Promise<PendingApproval | null> {
  let pendingApproval: PendingApproval | null = null

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
        pendingApproval = {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          reason: event.reason,
          runId: event.runId,
        }
        break
      case 'done':
        onFinish?.()
        continue
    }
    yieldContent()
  }

  return pendingApproval
}

function buildContent(text: { value: string }, toolCalls: ToolCall[]): any[] {
  const content: any[] = []
  if (text.value) content.push({ type: 'text' as const, text: text.value })
  content.push(...toolCalls)
  return content
}

function createPikkuAdapter(
  optionsRef: React.RefObject<PikkuAgentRuntimeOptions>,
  pendingApprovalRef: React.RefObject<PendingApproval | null>,
  onFinishRef: React.RefObject<(() => void) | undefined>
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const opts = optionsRef.current!

      // Check if this run() is a continuation after an approval decision.
      // assistant-ui calls run() again after addResult provides a tool result.
      const pending = pendingApprovalRef.current
      if (pending) {
        pendingApprovalRef.current = null

        // Determine if the user approved or denied from the tool result
        // that assistant-ui added via addResult({ approved: true/false })
        let approved = true
        const lastAssistant = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant')
        if (lastAssistant && Array.isArray(lastAssistant.content)) {
          const tc = (lastAssistant.content as any[]).find(
            (p: any) =>
              p.type === 'tool-call' && p.toolCallId === pending.toolCallId
          )
          if (tc?.result) {
            try {
              const r =
                typeof tc.result === 'string'
                  ? JSON.parse(tc.result)
                  : tc.result
              if (r && typeof r.approved === 'boolean') {
                approved = r.approved
              }
            } catch {
              // not JSON, treat as approved
            }
          }
        }

        // Call /resume (SSE) — both approves and continues the agent
        const resumeResponse = await fetch(
          `${opts.api}/${opts.agentName}/resume`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...opts.headers },
            body: JSON.stringify({
              runId: pending.runId,
              toolCallId: pending.toolCallId,
              approved,
            }),
            signal: abortSignal,
            credentials: opts.credentials,
          }
        )

        if (!resumeResponse.ok || !resumeResponse.body) {
          return
        }

        // Process the resume SSE stream
        const text = { value: '' }
        const toolCalls: ToolCall[] = []
        let pendingContent: any[] | null = null
        const yieldContent = () => {
          const content = buildContent(text, toolCalls)
          if (content.length > 0) pendingContent = content
        }

        const reader = resumeResponse.body.getReader()
        const nextApproval = await processStream(
          reader,
          text,
          toolCalls,
          yieldContent,
          onFinishRef.current ?? undefined
        )

        if (pendingContent) {
          if (nextApproval) {
            // Another approval needed in the continuation — deduplicate
            for (let i = toolCalls.length - 1; i >= 0; i--) {
              if (
                toolCalls[i].toolName === nextApproval.toolName &&
                toolCalls[i].toolCallId !== nextApproval.toolCallId
              ) {
                toolCalls.splice(i, 1)
              }
            }
            const resumeApprovalToolCall: ToolCall = {
              type: 'tool-call',
              toolCallId: nextApproval.toolCallId,
              toolName: nextApproval.toolName,
              args: {
                ...(typeof nextApproval.args === 'object' &&
                nextApproval.args !== null
                  ? (nextApproval.args as Record<string, unknown>)
                  : {}),
                ...(nextApproval.reason
                  ? { __approvalReason: nextApproval.reason }
                  : {}),
              },
            }
            const idx = toolCalls.findIndex(
              (tc) => tc.toolCallId === nextApproval.toolCallId && !tc.result
            )
            if (idx !== -1) {
              toolCalls[idx] = resumeApprovalToolCall
            } else {
              toolCalls.push(resumeApprovalToolCall)
            }
            pendingApprovalRef.current = nextApproval
            pendingContent = buildContent(text, toolCalls)
            yield {
              content: pendingContent,
              status: {
                type: 'requires-action' as const,
                reason: 'tool-calls' as const,
              },
            }
          } else {
            yield { content: pendingContent }
          }
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
      const approval = await processStream(
        reader,
        text,
        toolCalls,
        yieldContent,
        onFinishRef.current ?? undefined
      )

      if (!approval) {
        // No approval needed — yield final content and done
        if (pendingContent) {
          yield { content: pendingContent }
        }
        return
      }

      // Approval requested: store it for the next run() call
      pendingApprovalRef.current = approval

      // The tool call from the stream needs to be shown without a result
      // so assistant-ui renders it as requires-action
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

      // Remove any forwarded sub-agent tool calls that duplicate the approval's
      // displayed tool name (these arrive via the scoped channel before the
      // approval-request event and would otherwise render a second approval prompt).
      for (let i = toolCalls.length - 1; i >= 0; i--) {
        if (
          toolCalls[i].toolName === approval.toolName &&
          toolCalls[i].toolCallId !== approval.toolCallId
        ) {
          toolCalls.splice(i, 1)
        }
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

      const content = buildContent(text, toolCalls)
      yield {
        content,
        status: {
          type: 'requires-action' as const,
          reason: 'tool-calls' as const,
        },
      }
      // Generator returns here. assistant-ui will show the approval UI.
      // When the user clicks Approve/Deny → addResult → run() is called again.
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
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null)

  const optionsRef = useRef(options)
  optionsRef.current = options

  const onFinishRef = useRef(options.onFinish)
  onFinishRef.current = options.onFinish

  const pendingApprovalRef = useRef<PendingApproval | null>(null)

  const adapter = useMemo(
    () => createPikkuAdapter(optionsRef, pendingApprovalRef, onFinishRef),
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

  const handleApproval = useCallback(async (approved: boolean) => {
    setPendingApproval(null)
  }, [])

  return { runtime, pendingApproval, handleApproval }
}
