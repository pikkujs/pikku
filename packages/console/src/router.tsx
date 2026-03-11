import { createContext, useContext, forwardRef } from 'react'

export interface LinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  children: React.ReactNode
}

export type LinkComponent = React.ForwardRefExoticComponent<
  LinkProps & React.RefAttributes<HTMLAnchorElement>
>

export type SetSearchParams = (
  next:
    | Record<string, string>
    | URLSearchParams
    | ((prev: URLSearchParams) => URLSearchParams),
  options?: { replace?: boolean }
) => void

export interface ConsoleRouter {
  Link: LinkComponent
  useNavigate: () => (to: string) => void
  useLocation: () => { pathname: string }
  useSearchParams: () => [URLSearchParams, SetSearchParams]
}

const RouterContext = createContext<ConsoleRouter | null>(null)

export const ConsoleRouterProvider = RouterContext.Provider

export const useConsoleRouter = (): ConsoleRouter => {
  const ctx = useContext(RouterContext)
  if (!ctx) {
    throw new Error(
      'useConsoleRouter must be used within a ConsoleRouterProvider'
    )
  }
  return ctx
}

export const useLink = (): LinkComponent => useConsoleRouter().Link
export const useNavigate = () => useConsoleRouter().useNavigate()
export const useLocation = () => useConsoleRouter().useLocation()
export const useSearchParams = () => useConsoleRouter().useSearchParams()
