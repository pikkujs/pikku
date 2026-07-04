import { createContext, useContext, type ReactNode } from 'react'
import { useSearchParams, useNavigate } from '../router'

export type ConsoleSection = 'workflows'

export interface ConsoleNavigator {
  workflowId: string | null
  navigateTo: (section: ConsoleSection, id?: string) => void
}

const Ctx = createContext<ConsoleNavigator | null>(null)

export function useConsoleNavigator(): ConsoleNavigator {
  const ctx = useContext(Ctx)
  if (!ctx)
    throw new Error(
      'useConsoleNavigator must be used within a navigator provider'
    )
  return ctx
}

export { Ctx as ConsoleNavigatorCtx }

/** OSS default — IDs live in the `?id=` query param. */
export const OSSConsoleNavigator: React.FC<{
  children: ReactNode
  basePath?: string
}> = ({ children, basePath = '/workflow' }) => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  return (
    <Ctx.Provider
      value={{
        workflowId: searchParams.get('id'),
        navigateTo: (_section, id) => {
          navigate(id ? `${basePath}?id=${encodeURIComponent(id)}` : basePath)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
