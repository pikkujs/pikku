import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAgentThreads, useAgentThreadMessages } from '@/hooks/useAgentRuns'

export interface AgentThread {
  id: string
  status: string
  createdAt: string
  label?: string
}

interface AgentPlaygroundContextType {
  agentId: string
  threadId: string | null
  setThreadId: (id: string | null) => void
  threads: AgentThread[]
  createNewThread: () => void
  refetchThreads: () => void
  dbMessages: any[] | undefined
}

const AgentPlaygroundContext = createContext<
  AgentPlaygroundContextType | undefined
>(undefined)

export const useAgentPlayground = () => {
  const context = useContext(AgentPlaygroundContext)
  if (!context) {
    throw new Error(
      'useAgentPlayground must be used within AgentPlaygroundProvider'
    )
  }
  return context
}

interface AgentPlaygroundProviderProps {
  children: React.ReactNode
  agentId: string
}

const mapDbThreadToAgentThread = (dbThread: any): AgentThread => ({
  id: dbThread.id,
  status: 'completed',
  createdAt: dbThread.createdAt,
  label: dbThread.title || dbThread.id.slice(0, 8),
})

export const AgentPlaygroundProvider: React.FunctionComponent<
  AgentPlaygroundProviderProps
> = ({ children, agentId }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialThreadId = searchParams.get('threadId')
  const [threadId, setThreadIdState] = useState<string | null>(initialThreadId)

  const { data: dbThreads, refetch: refetchThreads } = useAgentThreads(agentId)
  const { data: dbMessages } = useAgentThreadMessages(threadId)

  const threads: AgentThread[] = ((dbThreads as any[]) || []).map(
    mapDbThreadToAgentThread
  )

  const setThreadId = useCallback(
    (id: string | null) => {
      setThreadIdState(id)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (id) {
            next.set('threadId', id)
          } else {
            next.delete('threadId')
          }
          return next
        },
        { replace: true }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    const urlThreadId = searchParams.get('threadId')
    if (urlThreadId !== threadId) {
      setThreadIdState(urlThreadId)
    }
  }, [searchParams])

  const createNewThread = useCallback(() => {
    const newId = crypto.randomUUID()
    setThreadId(newId)
  }, [setThreadId])

  return (
    <AgentPlaygroundContext.Provider
      value={{
        agentId,
        threadId,
        setThreadId,
        threads,
        createNewThread,
        refetchThreads: () => {
          refetchThreads()
        },
        dbMessages: dbMessages as any[] | undefined,
      }}
    >
      {children}
    </AgentPlaygroundContext.Provider>
  )
}
