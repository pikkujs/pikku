import { createContext, useContext, type ReactNode } from 'react'
import { useSearchParams, useNavigate } from '../router'

export type ConsoleSection = 'workflows' | 'scenarios'

export interface ConsoleNavigator {
  workflowId: string | null
  scenarioId: string | null
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
        // OSS default: each page mounts its own navigator under its own
        // basePath and reads only the id it cares about, so exposing the same
        // `?id=` value under both keys is harmless.
        workflowId: searchParams.get('id'),
        scenarioId: searchParams.get('id'),
        navigateTo: (_section, id) => {
          navigate(id ? `${basePath}?id=${encodeURIComponent(id)}` : basePath)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}
