import { forwardRef } from 'react'
import {
  Link as RRLink,
  useNavigate as useRRNavigate,
  useLocation as useRRLocation,
  useSearchParams as useRRSearchParams,
} from 'react-router-dom'
import type { ConsoleRouter, LinkProps } from '@/router'

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
    return (to: string) => nav(to)
  },
  useLocation: () => {
    const loc = useRRLocation()
    return { pathname: loc.pathname }
  },
  useSearchParams: useRRSearchParams as ConsoleRouter['useSearchParams'],
}
