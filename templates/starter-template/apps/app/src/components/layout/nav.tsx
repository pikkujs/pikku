import type { FC } from 'react'
import type { I18nString } from '@pikku/react'
import { NavLink, Stack } from '@pikku/mantine/core'
import { Link, useRouterState } from '@tanstack/react-router'
import type { FileRouteTypes } from '@/routeTree.gen'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

/** Every path the router knows, so a nav item to a missing screen is a type error. */
export type AppPath = FileRouteTypes['to']

export type NavIcon = FC<{ size?: number }>

export interface NavItem {
  to: AppPath
  label: I18nString
  Icon: NavIcon
}

/** A component, not a node, so one definition serves 16px in a list and 20px in the bar. */
function navGlyph(d: string): NavIcon {
  return function Glyph({ size = 16 }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    )
  }
}

export const HomeGlyph = navGlyph('M3 12 12 4l9 8M5 10v9h5v-6h4v6h5v-9')
export const AccountGlyph = navGlyph('M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21a7 7 0 0 1 18 0')
export const SignOutGlyph = navGlyph(
  'M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
)
/** Three dots: zero-length segments with a round cap render as circles. */
export const MoreGlyph = navGlyph('M5 12h.01M12 12h.01M19 12h.01')
/** The paired chevrons that mark a row as a menu trigger rather than a link. */
export const SelectorGlyph = navGlyph('M8 9l4-4 4 4M8 15l4 4 4-4')
export const CheckGlyph = navGlyph('M20 6 9 17l-5-5')

/**
 * EDIT ME — one entry per screen. The only place navigation is defined.
 *
 * A hook, not a constant, because `useLocale()` re-renders callers on a language
 * switch and labels must be `m.*()` calls (the i18n gate rejects plain strings).
 *
 * Destinations only. Account, preferences and sign-out belong to `ShellSettings`,
 * which every shell mounts — listing `/app/account` here too would light two rows
 * for one screen.
 */
export function useNavItems(): NavItem[] {
  useLocale()
  return [{ to: '/app', label: m.nav__home(), Icon: HomeGlyph }]
}

/**
 * The MOST SPECIFIC nav item the URL is under, not the first prefix match — a naive
 * `startsWith` leaves the root `/app` item lit on every child route, so two items
 * look selected at once. The `+ '/'` boundary stops `/app` matching `/apples`.
 */
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

/**
 * The vertical nav list — the desktop sidebar, and the overflow inside the phone's
 * More sheet or nav drawer.
 *
 * @param onNavigate - Fires after a tap, for a surface that has to put itself away.
 */
export const NavList: FC<{ items: NavItem[]; onNavigate?: () => void }> = ({
  items,
  onNavigate,
}) => {
  const activePath = useActiveNavPath(items)

  return (
    <Stack gap={2}>
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          component={Link}
          to={to}
          label={label}
          leftSection={<Icon />}
          active={to === activePath}
          onClick={onNavigate}
        />
      ))}
    </Stack>
  )
}
