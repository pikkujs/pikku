import { useCallback, useMemo, useState } from 'react'
import { asI18n } from '@pikku/react'
import { useMantineColorScheme } from '@pikku/mantine/core'
import { spotlight } from '@mantine/spotlight'
import { Moon, RefreshCw, Search, Sun, UserCog } from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useLocation, useNavigate } from '../../router'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { ImpersonateDrawer } from '../auth/ImpersonateDrawer'
import {
  useDefaultNavSections,
  type NavItem,
  type NavSection,
} from '../project/Sidebar'
import {
  consoleLogoInvert,
  consoleLogoSrc,
  consoleTitle,
} from '../../lib/branding'
import { NavDock } from './NavDock'
import type {
  DockEntry,
  DockMenu,
  DockTile,
  FlyoutRow,
  FlyoutSection,
} from './model'

/**
 * The console's navigation dock: {@link NavDock} fed from the same nav model the
 * sidebar reads, so the two never disagree about what the console contains.
 *
 * The zone split is the one adaptation the console needs. Fabric has scopes, so
 * its contextual zone is what varies as you move between an org, a project and a
 * workspace; the console has one project and nothing varies, so the split is by
 * how often you reach for a thing instead:
 *
 *  - the first nav section's items are TILES, one click, always in the same
 *    place — the surfaces you work on,
 *  - every other section is one group tile whose flyout holds its items — the
 *    things you go and look up.
 *
 * The identity tile carries the whole nav map, so nothing is more than two
 * clicks away and the full list is reachable even condensed.
 */
export function ConsoleNavDock({
  sections: sectionsProp,
}: {
  sections?: NavSection[]
}) {
  useLocale()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { refresh, loading: metaLoading } = usePikkuMeta()
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const auth = useOptionalAuth()
  const canImpersonate = auth?.can('admin:impersonate') ?? false
  const [impersonateOpen, setImpersonateOpen] = useState(false)

  const defaultSections = useDefaultNavSections()
  const sections = sectionsProp ?? defaultSections

  const tileOf = useCallback(
    (item: NavItem): DockTile => ({
      id: item.href,
      label: item.label,
      Icon: item.icon,
      match: [item.matchPrefix],
      onSelect: () => navigate(item.href),
    }),
    [navigate]
  )

  const rowOf = useCallback(
    (item: NavItem): FlyoutRow => ({
      key: item.href,
      Icon: item.icon,
      label: item.label,
      match: [item.matchPrefix],
      onSelect: () => navigate(item.href),
    }),
    [navigate]
  )

  const [primary, ...rest] = sections

  const pinned = useMemo<DockEntry[]>(
    () => (primary?.items ?? []).map(tileOf),
    [primary, tileOf]
  )

  /* A section with no title is not a group — it is a loose leaf that belongs on
     the row itself (Changes). Grouping it would hide one item behind a menu
     whose label would have to be invented. */
  const contextual = useMemo<DockEntry[]>(
    () =>
      rest.flatMap((section): DockEntry[] => {
        if (!section.title) return section.items.map(tileOf)
        const rows = section.items.map(rowOf)
        return [
          {
            id: section.id ?? section.title,
            label: section.title,
            Icon: section.icon ?? section.items[0]?.icon,
            isGroup: true,
            match: rows.flatMap((r) => r.match ?? []),
            menu: { label: section.title, sections: [{ key: 'main', rows }] },
          },
        ]
      }),
    [rest, rowOf, tileOf]
  )

  const utility = useMemo<DockTile[]>(() => {
    const tiles: DockTile[] = [
      {
        id: 'search',
        label: m.common_search(),
        Icon: Search,
        shortcut: '⌘K',
        onSelect: () => spotlight.open(),
      },
      {
        id: 'refresh',
        label: m.sidebar_refresh_metadata(),
        Icon: RefreshCw,
        badge: metaLoading ? { kind: 'busy', tone: 'accent' } : undefined,
        onSelect: () => refresh(),
      },
      {
        id: 'scheme',
        label:
          colorScheme === 'dark'
            ? m.sidebar_switch_to_light()
            : m.sidebar_switch_to_dark(),
        Icon: colorScheme === 'dark' ? Sun : Moon,
        onSelect: () => toggleColorScheme(),
      },
    ]
    if (canImpersonate) {
      tiles.push({
        id: 'impersonate',
        label: m.impersonate_button(),
        Icon: UserCog,
        onSelect: () => setImpersonateOpen(true),
      })
    }
    return tiles
  }, [metaLoading, refresh, colorScheme, toggleColorScheme, canImpersonate])

  /* The flyout's head answers "where am I" in full, which the one-glyph tile
     cannot: the console's name, the path that produced the page you are on, and
     — below it — every section there is. */
  const identityMenu = useMemo<DockMenu>(() => {
    const label = asI18n(consoleTitle)
    const navSections: FlyoutSection[] = sections
      .filter((s) => s.items.length > 0)
      .map((s, i) => ({
        key: s.id ?? `section-${i}`,
        title: s.title || undefined,
        rows: s.items.map(rowOf),
      }))
    return {
      label,
      head: {
        mark: consoleTitle.slice(0, 2).toUpperCase(),
        title: label,
        sub: asI18n(pathname),
      },
      sections: [
        ...navSections,
        {
          key: 'browse',
          rows: [
            {
              key: 'browse-all',
              Icon: Search,
              label: m.nav_dock_go_to(),
              hint: '⌘K',
              onSelect: () => spotlight.open(),
            },
          ],
        },
      ],
    }
  }, [sections, rowOf, pathname])

  const isActive = useCallback(
    (t: Pick<DockTile, 'match'>) =>
      !!t.match?.some((prefix) => pathname.includes(prefix)),
    [pathname]
  )

  return (
    <>
      <NavDock
        identity={{
          id: 'console',
          label: asI18n(consoleTitle),
          render: 'switcher',
          menu: identityMenu,
        }}
        brand={
          <img
            src={consoleLogoSrc}
            alt=""
            style={
              consoleLogoInvert
                ? { filter: 'brightness(0) invert(1)' }
                : undefined
            }
          />
        }
        pinned={pinned}
        contextual={contextual}
        utility={utility}
        isActive={isActive}
      />
      {canImpersonate && (
        <ImpersonateDrawer
          opened={impersonateOpen}
          onClose={() => setImpersonateOpen(false)}
        />
      )}
    </>
  )
}
