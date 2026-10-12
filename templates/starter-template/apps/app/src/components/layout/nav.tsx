import type { ComponentType } from 'react'
import type { I18nString } from '@pikku/react'
import { Link, useRouterState } from '@tanstack/react-router'
import { HomeIcon } from 'lucide-react'
import type { FileRouteTypes } from '@/routeTree.gen'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { cn } from '@/lib/utils'

export type AppPath = FileRouteTypes['to']

export interface NavItem {
  to: AppPath
  label: I18nString
  Icon: ComponentType<{ className?: string }>
}

export function useNavItems(): NavItem[] {
  useLocale()
  return [{ to: '/app', label: m.nav__home(), Icon: HomeIcon }]
}

export function activeNavPath(pathname: string, items: NavItem[]): string | undefined {
  return items
    .map((i) => i.to as string)
    .filter((to) => pathname === to || pathname.startsWith(to + '/'))
    .sort((a, b) => b.length - a.length)[0]
}

export function useActiveNavPath(items: NavItem[]): string | undefined {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return activeNavPath(pathname, items)
}

export function NavList({ items }: { items: NavItem[] }) {
  const active = useActiveNavPath(items)
  return (
    <nav className="flex flex-col gap-1">
      {items.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className={cn(
            'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            to === active && 'bg-accent text-accent-foreground',
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  )
}

export function MobileTabBar({ items }: { items: NavItem[] }) {
  const active = useActiveNavPath(items)
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t bg-background md:hidden">
      {items.map(({ to, label, Icon }) => (
        <Link
          key={to}
          to={to}
          className={cn(
            'flex flex-1 flex-col items-center gap-1 py-2 text-xs text-muted-foreground',
            to === active && 'text-primary',
          )}
        >
          <Icon className="size-5" />
          {label}
        </Link>
      ))}
    </nav>
  )
}
