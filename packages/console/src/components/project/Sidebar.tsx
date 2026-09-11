import { useLocation, useLink } from '../../router'
import {
  Stack,
  Box,
  Text,
  useMantineTheme,
  useMantineColorScheme,
  Tooltip,
  NavLink,
  Divider,
  ActionIcon,
  UnstyledButton,
} from '@pikku/mantine/core'
import type { I18nNode, I18nString } from '@pikku/react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useLocalStorage } from '@mantine/hooks'
import {
  FunctionSquare,
  GitBranch,
  Bot,
  Globe,
  Clock,
  Server,
  KeyRound,
  Variable,
  ChevronLeft,
  ChevronRight,
  Search,
  Package,
  RefreshCw,
  GitCompare,
  Mail,
  Route,
  Gauge,
  UserSearch,
  UserRound,
  BookOpen,
  Database,
  Users,
  Sun,
  Moon,
  UserCog,
  ShieldCheck,
  Shield,
  UsersRound,
  ScrollText,
  Webhook,
  Lock,
  Target,
  DoorOpen,
  Boxes,
  FlaskConical,
  Activity,
  Braces,
  Radio,
  Plug,
  Terminal,
  Network,
  ListOrdered,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { spotlight } from '@mantine/spotlight'
import {
  consoleLogoInvert,
  consoleLogoSrc,
  consoleTitle,
} from '../../lib/branding'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { useOptionalImpersonation } from '../../context/ImpersonationContext'
import { useSidebarMode } from '../../context/SidebarModeProvider'
import { ImpersonateDrawer } from '../auth/ImpersonateDrawer'
import css from '../ui/console.module.css'

export interface NavItem {
  /** A string rather than a node: the dock reads a nav label into a tooltip, a
   *  tile's `aria-label` and a flyout row's composed one, and an element cannot
   *  be any of those. */
  label: I18nString
  href: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  matchPrefix: string
  /**
   * The titled band this item sits in inside its section's flyout — the same
   * taxonomy Fabric's dock uses, so the two consoles name the same shelf the
   * same way. Items carrying one group must be adjacent; the dock closes a band
   * as soon as the group id changes. A section whose items declare none opens
   * as one untitled list.
   */
  group?: { id: string; title: I18nString }
}

export interface NavSection {
  /**
   * Stable, untranslated key for the section. The accordion tracks which
   * section is open by this key, so the open section survives a locale change;
   * it also gives a section an identity that is declared in code rather than
   * rendered to the user. Falls back to the title for callers that predate it.
   */
  id?: string
  title: I18nString
  /** The section's own glyph, for surfaces that draw a section rather than list
   *  it — the dock collapses each section to one tile. Falls back to the first
   *  item's icon, which is a guess: two sections whose first items happen to
   *  share a glyph become indistinguishable. */
  icon?: React.ComponentType<{ size?: number; color?: string }>
  /**
   * Where the dock puts the section: `row` spreads its items along the dock as
   * tiles of their own, `group` collapses them behind one tile whose flyout
   * lists them. The rail draws both the same way. Defaults to `row` for an
   * untitled section — there is no label to put on a group — and `group`
   * otherwise.
   */
  zone?: 'row' | 'group'
  /** Opens a new band on the dock: a separator is drawn before this section.
   *  Fabric breaks its row into who/what, building/checking, and running — the
   *  breaks are part of the taxonomy, not decoration. */
  separatorBefore?: boolean
  items: NavItem[]
}

// Built via a hook so the default nav labels go through t(). Callers can still
// pass their own `sections` prop with already-translated labels.
export function useDefaultNavSections(): NavSection[] {
  useLocale()
  return [
    /* Fabric's stage dock, section for section, minus what an OSS console does
       not have: the console IS a subset of a fabric project seen from closer
       in, so the same thing must live on the same shelf under the same name.
       Overview stands where fabric puts Health, Workflows stays a tile of its
       own between Testing and Operate, and every other destination collapses
       into the group fabric collapses it into. */
    {
      id: 'main',
      title: asI18n(''),
      zone: 'row',
      items: [
        {
          label: m.nav_overview(),
          href: '/overview',
          icon: Gauge,
          matchPrefix: '/overview',
        },
      ],
    },
    {
      id: 'people',
      title: m.nav_people(),
      icon: Users,
      separatorBefore: true,
      items: [
        {
          label: m.nav_users(),
          href: '/users',
          icon: Users,
          matchPrefix: '/users',
          group: { id: 'members', title: m.nav_group_who_is_in_it() },
        },
        {
          label: m.nav_roles(),
          href: '/roles',
          icon: UsersRound,
          matchPrefix: '/roles',
          group: { id: 'access', title: m.nav_group_what_they_may_do() },
        },
        {
          label: m.nav_scopes(),
          href: '/scopes',
          icon: Shield,
          matchPrefix: '/scopes',
          group: { id: 'access', title: m.nav_group_what_they_may_do() },
        },
        {
          label: m.nav_audit(),
          href: '/audit',
          icon: ScrollText,
          matchPrefix: '/audit',
          group: { id: 'done', title: m.nav_group_what_they_have_done() },
        },
        {
          // A credential is an account somebody linked, not a permission
          // somebody was granted — it sits with the people it belongs to,
          // under the same name Operate gives the project's own links.
          label: m.nav_credentials(),
          href: '/credentials',
          icon: KeyRound,
          matchPrefix: '/credentials',
          group: { id: 'connections', title: m.nav_group_connections() },
        },
      ],
    },
    {
      id: 'content',
      title: m.nav_content(),
      icon: Boxes,
      items: [
        {
          label: m.nav_database(),
          href: '/database',
          icon: Database,
          matchPrefix: '/database',
          group: { id: 'data', title: m.nav_group_data() },
        },
        {
          label: m.nav_knowledge(),
          href: '/knowledge',
          icon: BookOpen,
          matchPrefix: '/knowledge',
          group: { id: 'data', title: m.nav_group_data() },
        },
        {
          label: m.nav_emails(),
          href: '/emails',
          icon: Mail,
          matchPrefix: '/emails',
          group: { id: 'copy', title: m.nav_group_copy() },
        },
      ],
    },
    {
      id: 'ai',
      title: m.nav_ai(),
      icon: Bot,
      separatorBefore: true,
      items: [
        {
          label: m.nav_agents(),
          href: '/agents',
          icon: Bot,
          matchPrefix: '/agents',
          group: { id: 'doing', title: m.nav_group_doing_the_work() },
        },
        {
          label: m.nav_scorers(),
          href: '/scorers',
          icon: Target,
          matchPrefix: '/scorers',
          group: { id: 'checking', title: m.nav_group_checking_the_work() },
        },
        {
          label: m.nav_virtual_users(),
          href: '/virtual-users',
          icon: UserSearch,
          matchPrefix: '/virtual-users',
          group: { id: 'checking', title: m.nav_group_checking_the_work() },
        },
      ],
    },
    {
      // Declared people and real ones sit apart the way fabric sits them: a
      // persona is who the product is tested as, so it belongs with the tests
      // rather than with the users who actually turned up.
      id: 'testing',
      title: m.nav_testing(),
      icon: FlaskConical,
      items: [
        {
          label: m.nav_scenarios(),
          href: '/scenarios',
          icon: Route,
          matchPrefix: '/scenarios',
          group: { id: 'what', title: m.nav_group_what_is_tested() },
        },
        {
          label: m.nav_personas(),
          href: '/personas',
          icon: UserRound,
          matchPrefix: '/personas',
          group: { id: 'who', title: m.nav_group_who_tests_it() },
        },
      ],
    },
    {
      // A tile of its own, exactly as in fabric: a workflow is neither what the
      // product is made of nor how it is run, and burying it in either loses
      // the one screen people come back to hourly.
      id: 'workflows',
      title: asI18n(''),
      zone: 'row',
      items: [
        {
          label: m.nav_workflows(),
          href: '/workflow',
          icon: GitBranch,
          matchPrefix: '/workflow',
        },
      ],
    },
    {
      id: 'operate',
      title: m.nav_operate(),
      icon: Activity,
      separatorBefore: true,
      items: [
        {
          label: m.nav_env_vars(),
          href: '/variables',
          icon: Variable,
          matchPrefix: '/variables',
          group: { id: 'configuration', title: m.nav_group_configuration() },
        },
        {
          label: m.nav_secrets(),
          href: '/secrets',
          icon: KeyRound,
          matchPrefix: '/secrets',
          group: { id: 'configuration', title: m.nav_group_configuration() },
        },
        {
          label: m.nav_security(),
          href: '/security',
          icon: ShieldCheck,
          matchPrefix: '/security',
          group: { id: 'configuration', title: m.nav_group_configuration() },
        },
        {
          label: m.nav_webhooks(),
          href: '/webhooks',
          icon: Webhook,
          matchPrefix: '/webhooks',
          group: { id: 'connections', title: m.nav_group_connections() },
        },
        {
          label: m.nav_addons(),
          href: '/addons',
          icon: Package,
          matchPrefix: '/addons',
          group: { id: 'connections', title: m.nav_group_connections() },
        },
      ],
    },
    {
      // OAuth is under "Where it runs" rather than with People because it
      // declares how sign-in is configured — it reads secrets. Everything under
      // People is live state.
      id: 'build',
      title: m.nav_build(),
      icon: Braces,
      items: [
        {
          // A function is what the wires point at, not a wire — it is the
          // source the rest of this section arranges.
          label: m.nav_functions(),
          href: '/functions',
          icon: FunctionSquare,
          matchPrefix: '/functions',
          group: { id: 'source', title: m.nav_group_source() },
        },
        {
          label: m.nav_http(),
          href: '/wires/http',
          icon: Globe,
          matchPrefix: '/wires/http',
          group: { id: 'wiring', title: m.nav_group_wiring() },
        },
        {
          label: m.nav_channels(),
          href: '/wires/channel',
          icon: Radio,
          matchPrefix: '/wires/channel',
          group: { id: 'wiring', title: m.nav_group_wiring() },
        },
        {
          label: m.nav_mcp(),
          href: '/wires/mcp',
          icon: Plug,
          matchPrefix: '/wires/mcp',
          group: { id: 'wiring', title: m.nav_group_wiring() },
        },
        {
          label: m.nav_cli(),
          href: '/wires/cli',
          icon: Terminal,
          matchPrefix: '/wires/cli',
          group: { id: 'wiring', title: m.nav_group_wiring() },
        },
        {
          label: m.nav_gateways(),
          href: '/wires/gateway',
          icon: Network,
          matchPrefix: '/wires/gateway',
          group: { id: 'wiring', title: m.nav_group_wiring() },
        },
        {
          label: m.nav_schedulers(),
          href: '/async/scheduler',
          icon: Clock,
          matchPrefix: '/async/scheduler',
          group: { id: 'async', title: m.nav_group_async() },
        },
        {
          label: m.nav_queues(),
          href: '/async/queue',
          icon: ListOrdered,
          matchPrefix: '/async/queue',
          group: { id: 'async', title: m.nav_group_async() },
        },
        {
          label: m.nav_triggers(),
          href: '/async/trigger',
          icon: Zap,
          matchPrefix: '/async/trigger',
          group: { id: 'async', title: m.nav_group_async() },
        },
        {
          label: m.nav_runtime(),
          href: '/runtime',
          icon: Server,
          matchPrefix: '/runtime',
          group: { id: 'runs', title: m.nav_group_where_it_runs() },
        },
        {
          label: m.nav_surface(),
          href: '/surface',
          icon: DoorOpen,
          matchPrefix: '/surface',
          group: { id: 'runs', title: m.nav_group_where_it_runs() },
        },
        {
          label: m.nav_oauth(),
          href: '/auth-providers',
          icon: Lock,
          matchPrefix: '/auth-providers',
          group: { id: 'runs', title: m.nav_group_where_it_runs() },
        },
        {
          label: m.nav_changes(),
          href: '/changes',
          icon: GitCompare,
          matchPrefix: '/changes',
          group: { id: 'shipping', title: m.nav_group_shipping() },
        },
      ],
    },
  ]
}

export interface SidebarBranding {
  logo: React.ReactNode
  title: I18nNode
  tooltipLabel: I18nString
  homeHref: string
}

const DEFAULT_BRANDING: SidebarBranding = {
  logo: (
    <img
      src={consoleLogoSrc}
      alt={consoleTitle}
      width={28}
      height={28}
      style={
        consoleLogoInvert ? { filter: 'brightness(0) invert(1)' } : undefined
      }
    />
  ),
  title: asI18n(consoleTitle),
  tooltipLabel: asI18n(consoleTitle),
  homeHref: '/',
}

export interface SidebarProps {
  sections?: NavSection[]
  branding?: SidebarBranding
  footer?: React.ReactNode
}

const COLLAPSED_WIDTH = 60
// Match the Fabric console rail (60 collapsed / 260 expanded).
const EXPANDED_WIDTH = 260

export const SIDEBAR_COLLAPSED_WIDTH = COLLAPSED_WIDTH
export const SIDEBAR_EXPANDED_WIDTH = EXPANDED_WIDTH

export const Sidebar: React.FC<SidebarProps> = ({
  sections: sectionsProp,
  branding = DEFAULT_BRANDING,
  footer,
}) => {
  const Link = useLink()
  useLocale()
  const defaultSections = useDefaultNavSections()
  const sections = sectionsProp ?? defaultSections
  const theme = useMantineTheme()
  const { pathname } = useLocation()
  const { refresh, loading: metaLoading } = usePikkuMeta()
  const sheet = useSidebarMode() === 'sheet'
  const [railCollapsed, setCollapsed] = useLocalStorage({
    key: 'sidebar-collapsed',
    defaultValue: false,
  })
  // A 60px icon rail inside a bottom sheet is pointless, and the stored desktop
  // preference must not follow the rail into a frame that has no room for it.
  const collapsed = sheet ? false : railCollapsed
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const auth = useOptionalAuth()
  const impersonation = useOptionalImpersonation()
  const canImpersonate =
    (auth?.can('admin:impersonate') ?? false) && impersonation !== null

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH

  const isActive = (item: NavItem) => pathname.includes(item.matchPrefix)

  // One section is open at a time, and it follows the route: the section owning
  // the current page is the one expanded, so the rail always shows where you
  // are. Opening another section is a browsing move that the next navigation
  // resolves — hence no persistence.
  const sectionKey = (section: NavSection) =>
    section.id ?? String(section.title)
  const routeSection =
    sections.find((s) => s.title && s.items.some(isActive)) ?? null
  const routeSectionKey = routeSection ? sectionKey(routeSection) : null
  const [openedSection, setOpenedSection] = useState<string | null>(
    routeSectionKey
  )
  useEffect(() => {
    if (routeSectionKey) setOpenedSection(routeSectionKey)
  }, [routeSectionKey])

  // In a sheet the Drawer already owns the frame — position, width, surface and
  // dismissal — so the rail only fills it. Restating any of that here is how a
  // rail ends up floating over the sheet that is meant to contain it.
  return (
    <Box
      pos={sheet ? undefined : 'fixed'}
      left={sheet ? undefined : 0}
      top={sheet ? undefined : 0}
      w={sheet ? '100%' : sidebarWidth}
      h={sheet ? undefined : '100vh'}
      className={sheet ? undefined : css.railCollapseTransition}
      style={{
        borderRight: sheet ? undefined : `1px solid var(--app-border)`,
        backgroundColor: sheet ? undefined : `var(--app-panel-bg-raised)`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        zIndex: sheet ? undefined : 100,
      }}
    >
      <Box
        px={collapsed ? 'xs' : 'sm'}
        py="xs"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          height: 50,
          flexShrink: 0,
        }}
      >
        <Tooltip
          label={branding.tooltipLabel}
          position="right"
          disabled={!collapsed}
        >
          <Link
            to={branding.homeHref}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            {branding.logo}
            {!collapsed && (
              <Text size="lg" fw={500}>
                {branding.title}
              </Text>
            )}
          </Link>
        </Tooltip>
        {!collapsed && (
          <Tooltip label={m.sidebar_search()}>
            <ActionIcon
              variant="subtle"
              size="sm"
              color="gray"
              onClick={spotlight.open}
            >
              <Search size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Box>

      <Box style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} py={4}>
        {sections.map((section, sectionIndex) => {
          // Untitled sections and the collapsed (icon-only) rail are never
          // accordion-gated; only titled sections collapse in the expanded rail.
          const key = sectionKey(section)
          const isRouteSection = !!section.title && key === routeSectionKey
          const sectionOpen =
            collapsed || !section.title || key === openedSection
          return (
            <Box key={sectionIndex}>
              {sectionIndex > 0 && <Divider my={4} mx="sm" />}
              {section.title && !collapsed && (
                <UnstyledButton
                  onClick={() => setOpenedSection(sectionOpen ? null : key)}
                  className={css.navSectionHeader}
                  data-testid="nav-section"
                  data-section={key}
                  data-active={isRouteSection || undefined}
                  aria-expanded={sectionOpen}
                >
                  <Text
                    size="xs"
                    fw={600}
                    style={{
                      color: 'inherit',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      fontSize: 11,
                    }}
                  >
                    {section.title}
                  </Text>
                  <ChevronRight
                    size={12}
                    style={{
                      transform: sectionOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform 150ms ease',
                    }}
                  />
                </UnstyledButton>
              )}
              {sectionOpen &&
                section.items.map((item) => {
                  const active = isActive(item)

                  if (collapsed) {
                    return (
                      <Tooltip
                        key={item.href}
                        label={item.label}
                        position="right"
                      >
                        <Box px={6} py={2}>
                          <NavLink
                            component={Link}
                            to={item.href}
                            data-testid="nav-link"
                            data-href={item.href}
                            active={active}
                            leftSection={
                              <item.icon
                                size={18}
                                color={active ? 'var(--app-accent)' : undefined}
                              />
                            }
                            variant="light"
                            style={{
                              borderRadius: theme.radius.sm,
                              justifyContent: 'center',
                              padding: '8px 0',
                              background: active
                                ? 'var(--app-surface-accent)'
                                : undefined,
                            }}
                            styles={{
                              section: { marginRight: 0 },
                              body: { display: 'none' },
                            }}
                          />
                        </Box>
                      </Tooltip>
                    )
                  }

                  return (
                    <Box key={item.href} px={6} py={1}>
                      <NavLink
                        component={Link}
                        to={item.href}
                        data-testid="nav-link"
                        data-href={item.href}
                        label={item.label}
                        leftSection={
                          <item.icon
                            size={16}
                            color={active ? 'var(--app-accent)' : undefined}
                          />
                        }
                        active={active}
                        variant="light"
                        style={{
                          borderRadius: theme.radius.sm,
                          fontSize: 13,
                          // 2px accent bar is the primary "you are here" cue; the
                          // soft tint + accent label reinforce it.
                          borderLeft: `2px solid ${active ? 'var(--app-accent-strong)' : 'transparent'}`,
                          background: active
                            ? 'var(--app-surface-accent)'
                            : undefined,
                        }}
                        styles={{
                          label: {
                            fontWeight: active ? 600 : 400,
                            color: active ? 'var(--app-accent)' : undefined,
                          },
                        }}
                      />
                    </Box>
                  )
                })}
            </Box>
          )
        })}
      </Box>

      {footer && (
        <Box className={css.noShrink} px={6} py={4}>
          <Divider mx="sm" mb={4} />
          {footer}
        </Box>
      )}

      <Box className={css.noShrink}>
        <Divider mx="sm" />
        <Stack gap={2} px={6} py={4}>
          {canImpersonate && (
            <Tooltip
              label={m.impersonate_button()}
              position="right"
              disabled={!collapsed}
            >
              <UnstyledButton
                onClick={() => impersonation?.openPicker()}
                data-testid="impersonate-open"
                px={collapsed ? 0 : 10}
                py={8}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  borderRadius: 6,
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                <UserCog size={18} />
                {!collapsed && <Text size="sm">{m.impersonate_button()}</Text>}
              </UnstyledButton>
            </Tooltip>
          )}
          <Tooltip
            label={m.sidebar_refresh_metadata()}
            position="right"
            disabled={!collapsed}
          >
            <UnstyledButton
              onClick={() => refresh()}
              disabled={metaLoading}
              px={collapsed ? 0 : 10}
              py={8}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                borderRadius: 6,
                color: 'var(--mantine-color-dimmed)',
                opacity: metaLoading ? 0.5 : 1,
              }}
            >
              <RefreshCw
                size={18}
                style={
                  metaLoading
                    ? { animation: 'spin 1s linear infinite' }
                    : undefined
                }
              />
              {!collapsed && <Text size="sm">{m.sidebar_refresh()}</Text>}
            </UnstyledButton>
          </Tooltip>
          <Tooltip
            label={
              colorScheme === 'dark'
                ? m.sidebar_switch_to_light()
                : m.sidebar_switch_to_dark()
            }
            position="right"
            disabled={!collapsed}
          >
            <UnstyledButton
              onClick={() => toggleColorScheme()}
              px={collapsed ? 0 : 10}
              py={8}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 10,
                borderRadius: 6,
                color: 'var(--mantine-color-dimmed)',
              }}
            >
              {colorScheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              {!collapsed && (
                <Text size="sm">
                  {colorScheme === 'dark'
                    ? m.sidebar_light_mode()
                    : m.sidebar_dark_mode()}
                </Text>
              )}
            </UnstyledButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Collapse control — mirrors the Fabric rail: a subtle rotating chevron
          pinned as the very last element, on its own footer below a divider,
          distinct from the utility actions above. A sheet is dismissed by its
          own tab, and collapsing it would leave an icon rail floating in a
          289px-wide surface, so the control is not offered there. */}
      {!sheet && (
        <Box className={css.noShrink}>
          <Divider mx="sm" />
          <Box px={6} py={4}>
            <Tooltip
              label={collapsed ? m.sidebar_expand() : m.sidebar_collapse()}
              position="right"
              disabled={!collapsed}
            >
              <UnstyledButton
                onClick={() => setCollapsed(!collapsed)}
                px={collapsed ? 0 : 10}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  gap: 10,
                  width: '100%',
                  height: 32,
                  borderRadius: 6,
                  color: 'var(--mantine-color-dimmed)',
                }}
              >
                <ChevronLeft
                  size={16}
                  style={{
                    transform: collapsed ? 'rotate(180deg)' : undefined,
                    flexShrink: 0,
                  }}
                />
                {!collapsed && (
                  <Text size="sm" fw={500} style={{ fontSize: 12.5 }}>
                    {m.sidebar_collapse()}
                  </Text>
                )}
              </UnstyledButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      {canImpersonate && (
        <ImpersonateDrawer
          opened={impersonation?.pickerOpen ?? false}
          onClose={() => impersonation?.closePicker()}
        />
      )}
    </Box>
  )
}
