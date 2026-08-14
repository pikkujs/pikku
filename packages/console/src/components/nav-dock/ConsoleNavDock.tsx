import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { asI18n } from '@pikku/react'
import { useMantineColorScheme } from '@pikku/mantine/core'
import { spotlight } from '@mantine/spotlight'
import {
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  Download,
  Languages,
  LogOut,
  Monitor,
  Moon,
  Palette,
  PanelBottom,
  Pin,
  RefreshCw,
  Search,
  Share,
  Sun,
  UserCog,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { supportedLocales, useLocale, type Locale } from '@/i18n/config'
import {
  getInstallPrompt,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
} from '../../lib/installPrompt'
import { DOCK_SIDES, useDockPrefs, type DockSide } from './useDockPrefs'
import { useLocation, useNavigate } from '../../router'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'
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
 * how often you reach for a thing instead — a section declares which side of it
 * it is on with `zone`, and the sections are the single source both this and the
 * rail read, so the two can never disagree about what the console contains.
 *
 * The identity tile carries the whole nav map, so nothing is more than two
 * clicks away and the full list is reachable even condensed.
 */
/** An untitled section has no label to hang a group off, so it stays on the row. */
const zoneOf = (s: NavSection): 'row' | 'group' =>
  s.zone ?? (s.title ? 'group' : 'row')

const initialsOf = (label: string) => label.trim().slice(0, 2).toUpperCase()

const SIDE_ICONS = {
  bottom: ArrowDownToLine,
  top: ArrowUpToLine,
  left: ArrowLeftToLine,
  right: ArrowRightToLine,
}

const sideLabel = (side: DockSide) =>
  side === 'bottom'
    ? m.nav_dock_bottom()
    : side === 'top'
      ? m.nav_dock_top()
      : side === 'left'
        ? m.nav_dock_left()
        : m.nav_dock_right()

/* Each language named in ITSELF, not in the language you are currently reading:
   someone who has landed in a locale they cannot read is exactly the person
   reaching for this menu, and "German" is no help to them. */
const localeLabel = (code: Locale) =>
  asI18n(new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code)

export function ConsoleNavDock({
  sections: sectionsProp,
}: {
  sections?: NavSection[]
}) {
  const { locale, setLocale } = useLocale()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { refresh, loading: metaLoading } = usePikkuMeta()
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const dock = useDockPrefs()
  const installPrompt = useSyncExternalStore(
    subscribeInstallPrompt,
    getInstallPrompt
  )
  const auth = useOptionalAuth()
  const impersonation = useOptionalImpersonation()
  const canImpersonate =
    (auth?.can('admin:impersonate') ?? false) && impersonation !== null

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

  const pinned = useMemo<DockEntry[]>(
    () =>
      sections
        .filter((s) => zoneOf(s) === 'row')
        .flatMap((s) => s.items.map(tileOf)),
    [sections, tileOf]
  )

  const contextual = useMemo<DockEntry[]>(
    () =>
      sections
        .filter((s) => zoneOf(s) === 'group' && s.items.length > 0)
        .map((section): DockEntry => {
          const rows = section.items.map(rowOf)
          return {
            id: section.id ?? section.title,
            label: section.title,
            Icon: section.icon ?? section.items[0]?.icon,
            isGroup: true,
            match: rows.flatMap((r) => r.match ?? []),
            menu: { label: section.title, sections: [{ key: 'main', rows }] },
          }
        }),
    [sections, rowOf]
  )

  /* Everything about you or your session, behind one tile: the appearance you
     read the console in, the metadata you re-pull, who you are pretending to be
     and the way out. Sign-out had no home in the shell at all before this — the
     only trigger was the not-authorized screen, which you never see once you
     are in. */
  const account = useMemo<DockTile>(() => {
    const user = auth?.user
    const name = user ? asI18n(user.name || user.email) : m.nav_account()
    const prefs: FlyoutRow[] = [
      {
        key: 'appearance',
        Icon: Palette,
        label: m.nav_appearance(),
        rows: [
          {
            key: 'light',
            Icon: Sun,
            label: m.nav_theme_light(),
            checked: colorScheme === 'light',
            exclusive: true,
            onSelect: () => setColorScheme('light'),
          },
          {
            key: 'dark',
            Icon: Moon,
            label: m.nav_theme_dark(),
            checked: colorScheme === 'dark',
            exclusive: true,
            onSelect: () => setColorScheme('dark'),
          },
          {
            key: 'auto',
            Icon: Monitor,
            label: m.nav_theme_auto(),
            checked: colorScheme === 'auto',
            exclusive: true,
            onSelect: () => setColorScheme('auto'),
          },
        ],
      },
      {
        key: 'language',
        Icon: Languages,
        label: m.nav_language(),
        meta: localeLabel(locale),
        rows: supportedLocales.map((code) => ({
          key: code,
          Icon: Languages,
          label: localeLabel(code),
          checked: code === locale,
          exclusive: true,
          onSelect: () => setLocale(code),
        })),
      },
      {
        key: 'dock',
        Icon: PanelBottom,
        label: m.nav_dock(),
        meta: sideLabel(dock.side),
        rows: [
          {
            key: 'always-visible',
            Icon: Pin,
            label: m.nav_dock_always_visible(),
            checked: dock.alwaysVisible,
            onSelect: () => dock.setAlwaysVisible(!dock.alwaysVisible),
          },
          ...DOCK_SIDES.map((side) => ({
            key: `side-${side}`,
            Icon: SIDE_ICONS[side],
            label: sideLabel(side),
            checked: dock.side === side,
            exclusive: true,
            onSelect: () => dock.setSide(side),
          })),
        ],
      },
    ]
    /* Three shapes, because the platforms genuinely differ: a browser holding a
       deferred prompt can install, iOS can only say where the control is, and a
       console already running installed has nothing to offer. Offering an
       install everywhere would mean a dead control on two of the three. */
    if (!isStandalone()) {
      if (installPrompt) {
        prefs.push({
          key: 'install',
          Icon: Download,
          label: m.nav_install_app(),
          onSelect: () => {
            void promptInstall().catch((err) => {
              console.error('install prompt failed', err)
            })
          },
        })
      } else if (isIos()) {
        prefs.push({
          key: 'install',
          Icon: Download,
          label: m.nav_install_app(),
          rows: [
            { key: 'share', Icon: Share, label: m.nav_install_ios_share() },
            {
              key: 'add',
              Icon: ArrowDownToLine,
              label: m.nav_install_ios_add(),
            },
          ],
        })
      }
    }
    const rows: FlyoutRow[] = [
      {
        key: 'refresh',
        Icon: RefreshCw,
        label: m.sidebar_refresh_metadata(),
        status: metaLoading ? 'busy' : undefined,
        onSelect: () => refresh(),
      },
    ]
    if (canImpersonate) {
      rows.push({
        key: 'impersonate',
        Icon: UserCog,
        label: m.impersonate_button(),
        onSelect: () => impersonation?.openPicker(),
      })
    }
    return {
      id: 'account',
      label: name,
      render: user ? 'account' : undefined,
      Icon: user ? undefined : UserCog,
      initials: user ? initialsOf(user.name || user.email) : undefined,
      menu: {
        label: name,
        head: user
          ? {
              mark: initialsOf(user.name || user.email),
              title: name,
              sub: asI18n(user.email),
            }
          : undefined,
        sections: [
          { key: 'prefs', rows: prefs },
          { key: 'session', rows },
          ...(user
            ? [
                {
                  key: 'out',
                  rows: [
                    {
                      key: 'sign-out',
                      Icon: LogOut,
                      label: m.auth_sign_out(),
                      danger: true,
                      onSelect: () => {
                        void auth?.signOut()
                      },
                    },
                  ],
                },
              ]
            : []),
        ],
      },
    }
  }, [
    auth,
    colorScheme,
    setColorScheme,
    locale,
    setLocale,
    dock,
    installPrompt,
    metaLoading,
    refresh,
    canImpersonate,
    impersonation,
  ])

  const utility = useMemo<DockTile[]>(
    () => [
      {
        id: 'search',
        label: m.common_search(),
        Icon: Search,
        shortcut: '⌘K',
        onSelect: () => spotlight.open(),
      },
      account,
    ],
    [account]
  )

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
          opened={impersonation?.pickerOpen ?? false}
          onClose={() => impersonation?.closePicker()}
        />
      )}
    </>
  )
}
