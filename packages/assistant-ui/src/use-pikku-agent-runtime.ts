import { useMemo, useEffect, useRef, useCallback } from 'react'
import { type ThreadMessageLike } from '@assistant-ui/react'
import { useDataStreamRuntime } from '@assistant-ui/react-data-stream'

export interface PikkuAgentRuntimeOptions {
  api: string
  threadId?: string | null
  initialMessages?: any[]
  onThreadCreated?: (id: string) => void
  onFinish?: () => void
  onApprovalRequest?: (data: { toolCallId: string }) => void
  credentials?: RequestCredentials
  headers?: Record<string, string>
}

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

export function usePikkuAgentRuntime(options: PikkuAgentRuntimeOptions) {
  const {
    api,
    threadId = null,
    initialMessages: rawInitialMessages,
    onThreadCreated,
    onFinish,
    onApprovalRequest,
    credentials,
    headers,
  } = options

  const threadIdRef = useRef(threadId)
  threadIdRef.current = threadId

  const justCreatedThreadRef = useRef(false)

  const bodyFn = useCallback(() => {
    let currentThreadId = threadIdRef.current
    if (!currentThreadId) {
      currentThreadId = crypto.randomUUID()
      justCreatedThreadRef.current = true
      onThreadCreated?.(currentThreadId)
    }
    return { threadId: currentThreadId }
  }, [onThreadCreated])

  const onData = useCallback(
    (event: { type: string; name: string; data: unknown }) => {
      if (event.name === 'approval-request') {
        const approval = event.data as any
        onApprovalRequest?.({
          toolCallId: approval.toolCallId,
        })
      }
    },
    [onApprovalRequest]
  )

  const onFinishCb = useCallback(() => {
    onFinish?.()
  }, [onFinish])

  const initialMessages = useMemo(
    () => (rawInitialMessages ? convertDbMessages(rawInitialMessages) : []),
    [rawInitialMessages]
  )

  const runtime = useDataStreamRuntime({
    api,
    protocol: 'ui-message-stream',
    body: bodyFn,
    onData,
    onFinish: onFinishCb,
    initialMessages,
    credentials,
    headers,
  })

  const prevThreadIdRef = useRef(threadId)
  const hasResetRef = useRef(false)
  useEffect(() => {
    if (prevThreadIdRef.current !== threadId) {
      prevThreadIdRef.current = threadId
      if (justCreatedThreadRef.current) {
        justCreatedThreadRef.current = false
        hasResetRef.current = true
        return
      }
      hasResetRef.current = false
      if (rawInitialMessages) {
        ;(runtime as any).thread.reset(convertDbMessages(rawInitialMessages))
        hasResetRef.current = true
      } else {
        ;(runtime as any).thread.reset([])
      }
    } else if (!hasResetRef.current && rawInitialMessages) {
      ;(runtime as any).thread.reset(convertDbMessages(rawInitialMessages))
      hasResetRef.current = true
    }
  }, [threadId, rawInitialMessages, runtime])

  return runtime
}
