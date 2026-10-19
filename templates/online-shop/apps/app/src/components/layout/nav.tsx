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
  /**
   * One line on what the screen is for.
   *
   * Unused by the sidebar, where the label and icon are the whole affordance,
   * and used by the home page to turn this list into the app's front door. It
   * lives here so navigation stays defined in exactly one place — a second list
   * of destinations is a second thing to forget to update.
   */
  description?: I18nString
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
export const CatalogueGlyph = navGlyph('M4 6h16M4 12h16M4 18h10')
export const BasketGlyph = navGlyph('M4 7h16l-1.5 11a2 2 0 0 1-2 1.8H7.5a2 2 0 0 1-2-1.8L4 7ZM9 7V5a3 3 0 0 1 6 0v2')
export const OrdersGlyph = navGlyph('M6 3h9l4 4v14H6V3ZM14 3v5h5M9 13h7M9 17h5')
export const AdminGlyph = navGlyph('M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1')
export const AssistantGlyph = navGlyph('M21 12a8 8 0 1 1-3.1-6.3L21 4v6h-6')
export const AccountGlyph = navGlyph('M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21a7 7 0 0 1 18 0')
export const SignOutGlyph = navGlyph(
  'M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4',
)
/** Three dots: zero-length segments with a round cap render as circles. */
export const MoreGlyph = navGlyph('M5 12h.01M12 12h.01M19 12h.01')

/**
 * EDIT ME — one entry per screen. The only place navigation is defined.
 *
 * A hook, not a constant, because `useLocale()` re-renders callers on a language
 * switch and labels must be `m.*()` calls (the i18n gate rejects plain strings).
 */
export function useNavItems(): NavItem[] {
  useLocale()
  return [
    { to: '/app', label: m.nav__home(), Icon: HomeGlyph },
    { to: '/app/catalogue', label: m.nav__catalogue(), description: m.nav__catalogue_hint(), Icon: CatalogueGlyph },
    { to: '/app/basket', label: m.nav__basket(), description: m.nav__basket_hint(), Icon: BasketGlyph },
    { to: '/app/orders', label: m.nav__orders(), description: m.nav__orders_hint(), Icon: OrdersGlyph },
    { to: '/app/admin', label: m.nav__admin(), description: m.nav__admin_hint(), Icon: AdminGlyph },
    { to: '/app/assistant', label: m.nav__assistant(), description: m.nav__assistant_hint(), Icon: AssistantGlyph },
    { to: '/app/account', label: m.nav__account(), description: m.nav__account_hint(), Icon: AccountGlyph },
  ]
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
          // TanStack's Link lights every ancestor of the current route by
          // default, so `/app` stays styled active on `/app/issues` and two
          // rows look selected at once. `activeNavPath` above already decided
          // which single item wins; this stops the Link from having its own
          // opinion about it.
          activeOptions={{ exact: true }}
          label={label}
          leftSection={<Icon />}
          active={to === activePath}
          onClick={onNavigate}
        />
      ))}
    </Stack>
  )
}
