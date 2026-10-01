import { forwardRef } from 'react'
import {
  Link as RRLink,
  useNavigate as useRRNavigate,
  useLocation as useRRLocation,
  useSearchParams as useRRSearchParams,
} from 'react-router'
import type { ConsoleRouter, LinkProps } from '../router'
import { reportAsyncError } from '../lib/async'

const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, children, ...rest }, ref) => (
    <RRLink to={to} ref={ref} {...rest}>
      {children}
    </RRLink>
  )
)
Link.displayName = 'Link'

export const reactRouterAdapter: ConsoleRouter = {
  Link,
  useNavigate: () => {
    const nav = useRRNavigate()
    // navigate may return a promise (data routers); a rejection is reported
    return (to: string) => {
      Promise.resolve(nav(to)).catch(reportAsyncError)
    }
  },
  useLocation: () => {
    const loc = useRRLocation()
    return { pathname: loc.pathname }
  },
  useSearchParams: useRRSearchParams as ConsoleRouter['useSearchParams'],
}
