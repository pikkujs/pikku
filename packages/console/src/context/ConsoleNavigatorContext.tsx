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
  if (!ctx) throw new Error('useConsoleNavigator must be used within a navigator provider')
  return ctx
}

export { Ctx as ConsoleNavigatorCtx }

const SECTION_PATHS: Record<ConsoleSection, string> = {
  workflows: '/workflow',
}

/** OSS default — IDs live in the `?id=` query param. */
export const OSSConsoleNavigator: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  return (
    <Ctx.Provider value={{
      workflowId: searchParams.get('id'),
      navigateTo: (section, id) => {
        const base = SECTION_PATHS[section]
        navigate(id ? `${base}?id=${encodeURIComponent(id)}` : base)
      },
    }}>
      {children}
    </Ctx.Provider>
  )
}
