import { useMemo, useEffect, useRef, useCallback } from 'react'
import { type ThreadMessageLike } from '@assistant-ui/react'
import { useDataStreamRuntime } from '@assistant-ui/react-data-stream'
import { getServerUrl } from '@/context/PikkuRpcProvider'

type PendingApproval = {
  toolCallId: string
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
  const justCreatedThreadRef = useRef(false)

  const serverUrl = getServerUrl()
  const api = `${serverUrl}/api/agents/${encodeURIComponent(agentId)}/stream`

  const bodyFn = useCallback(() => {
    let currentThreadId = threadIdRef.current
    if (!currentThreadId) {
      currentThreadId = crypto.randomUUID()
      justCreatedThreadRef.current = true
      onThreadCreated(currentThreadId)
    }
    return { threadId: currentThreadId }
  }, [onThreadCreated])

  const onData = useCallback(
    (event: { type: string; name: string; data: unknown }) => {
      if (event.name === 'approval-request') {
        const approval = event.data as any
        pendingApprovalRef.current = {
          toolCallId: approval.toolCallId,
        }
      }
    },
    []
  )

  const onFinishCb = useCallback(() => {
    onStreamDone()
  }, [onStreamDone])

  const initialMessages = useMemo(
    () => (dbMessages ? convertDbMessages(dbMessages) : []),
    [dbMessages]
  )

  const runtime = useDataStreamRuntime({
    api,
    protocol: 'ui-message-stream',
    body: bodyFn,
    onData,
    onFinish: onFinishCb,
    initialMessages,
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
