import { useMemo, useEffect, useRef } from 'react'
import {
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from '@assistant-ui/react'
import { getServerUrl } from '@/context/PikkuRpcProvider'

type ToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
}

type PendingApproval = {
  toolCallId: string
}

const parseSSEStream = async function* (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal
): AsyncGenerator<any> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    if (abortSignal?.aborted) break
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') continue

      try {
        yield JSON.parse(data)
      } catch {
        continue
      }
    }
  }
}

const processSSEEvents = async function* (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pendingApprovalRef: React.MutableRefObject<PendingApproval | null>,
  abortSignal?: AbortSignal
) {
  let text = ''
  const toolCalls: ToolCallPart[] = []
  let hasApproval = false
  const agentToolCallIds = new Set<string>()

  for await (const event of parseSSEStream(reader, abortSignal)) {
    switch (event.type) {
      case 'text-delta':
        text += event.text || event.textDelta || event.delta || ''
        break

      case 'tool-call':
        toolCalls.push({
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args || {},
        })
        break

      case 'tool-result': {
        if (agentToolCallIds.has(event.toolCallId)) break
        const idx = toolCalls.findIndex(
          (tc) => tc.toolCallId === event.toolCallId
        )
        if (idx !== -1) {
          toolCalls[idx] = { ...toolCalls[idx], result: event.result }
        }
        break
      }

      case 'agent-call': {
        const agentToolIdx = toolCalls.findIndex(
          (tc) => tc.toolName === event.agentName && !tc.result
        )
        if (agentToolIdx !== -1) {
          agentToolCallIds.add(toolCalls[agentToolIdx].toolCallId)
          toolCalls.splice(agentToolIdx, 1)
        }
        break
      }

      case 'agent-result':
        break

      case 'approval-request': {
        const approvalArgs: Record<string, unknown> = { ...(event.args || {}) }
        if (event.reason) {
          approvalArgs.__approvalReason = event.reason
        }
        const approvalIdx = toolCalls.findIndex(
          (tc) => tc.toolCallId === event.toolCallId
        )
        const approvalTc: ToolCallPart = {
          type: 'tool-call',
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: approvalArgs,
        }
        if (approvalIdx !== -1) {
          toolCalls[approvalIdx] = approvalTc
        } else {
          toolCalls.push(approvalTc)
        }
        hasApproval = true
        pendingApprovalRef.current = {
          toolCallId: event.toolCallId,
        }
        break
      }

      case 'error':
        text += `\n\n**Error:** ${event.error || event.message}`
        break

      case 'done':
        break
    }

    const contentParts: any[] = []
    if (text) {
      contentParts.push({ type: 'text' as const, text })
    }
    for (const tc of toolCalls) {
      contentParts.push(tc)
    }

    if (contentParts.length > 0) {
      yield {
        content: contentParts,
        status: hasApproval
          ? { type: 'requires-action' as const, reason: 'tool-calls' as const }
          : undefined,
      }
    }
  }
}

const createAdapter = (
  agentId: string,
  threadIdRef: React.RefObject<string | null>,
  pendingApprovalRef: React.MutableRefObject<PendingApproval | null>,
  onThreadCreated: (id: string) => void,
  onStreamDone: () => void
): ChatModelAdapter => ({
  async *run({ abortSignal }) {
    const pending = pendingApprovalRef.current

    if (pending) {
      pendingApprovalRef.current = null

      const lastMessage = arguments[0].messages.at(-1)
      let approved = true
      if (lastMessage?.role === 'assistant') {
        const toolParts =
          lastMessage.content?.filter(
            (p: any) =>
              p.type === 'tool-call' && p.toolCallId === pending.toolCallId
          ) ?? []
        for (const tp of toolParts) {
          if (tp.result != null) {
            const r =
              typeof tp.result === 'string' ? JSON.parse(tp.result) : tp.result
            if (r?.approved === false) {
              approved = false
            }
          }
        }
      }

      const serverUrl = getServerUrl()
      const response = await fetch(
        `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/resume`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolCallId: pending.toolCallId,
            approved,
          }),
          signal: abortSignal,
        }
      )

      if (!response.ok) {
        yield {
          content: [
            {
              type: 'text' as const,
              text: `Error: Resume responded with ${response.status}`,
            },
          ],
        }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        yield {
          content: [{ type: 'text' as const, text: 'Error: No response body' }],
        }
        return
      }

      try {
        yield* processSSEEvents(reader, pendingApprovalRef, abortSignal)
      } finally {
        onStreamDone()
      }
      return
    }

    let currentThreadId = threadIdRef.current
    if (!currentThreadId) {
      currentThreadId = crypto.randomUUID()
      onThreadCreated(currentThreadId)
    }

    const lastUserMessage = arguments[0].messages
      .filter((m: any) => m.role === 'user')
      .at(-1)
    const messageText =
      lastUserMessage?.content
        ?.filter((p: any) => p.type === 'text')
        .map((p: any) => p.text)
        .join('') || ''

    const serverUrl = getServerUrl()
    const response = await fetch(
      `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/stream`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: currentThreadId,
          message: messageText,
        }),
        signal: abortSignal,
      }
    )

    if (!response.ok) {
      yield {
        content: [
          {
            type: 'text' as const,
            text: `Error: Agent responded with ${response.status}`,
          },
        ],
      }
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      yield {
        content: [{ type: 'text' as const, text: 'Error: No response body' }],
      }
      return
    }

    try {
      yield* processSSEEvents(reader, pendingApprovalRef, abortSignal)
    } finally {
      onStreamDone()
    }
  },
})

const convertDbMessages = (dbMessages: any[]): ThreadMessageLike[] => {
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

export const useAgentRuntime = (
  agentId: string,
  threadId: string | null,
  dbMessages: any[] | undefined,
  onThreadCreated: (id: string) => void,
  onStreamDone: () => void
) => {
  const threadIdRef = useRef(threadId)
  threadIdRef.current = threadId

  const pendingApprovalRef = useRef<PendingApproval | null>(null)

  const adapter = useMemo(
    () =>
      createAdapter(
        agentId,
        threadIdRef,
        pendingApprovalRef,
        onThreadCreated,
        onStreamDone
      ),
    [agentId, onThreadCreated, onStreamDone]
  )

  const initialMessages = useMemo(
    () => (dbMessages ? convertDbMessages(dbMessages) : []),
    [dbMessages]
  )

  const runtime = useLocalRuntime(adapter, { initialMessages })

  const prevThreadIdRef = useRef(threadId)
  const hasResetRef = useRef(false)
  useEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      prevThreadIdRef.current = threadId
      hasResetRef.current = false
      if (dbMessages) {
        ;(runtime as any).thread.reset(convertDbMessages(dbMessages))
        hasResetRef.current = true
      } else {
        ;(runtime as any).thread.reset([])
      }
    } else if (!hasResetRef.current && dbMessages) {
      ;(runtime as any).thread.reset(convertDbMessages(dbMessages))
      hasResetRef.current = true
    }
  }, [threadId, dbMessages, runtime])

  return runtime
}
