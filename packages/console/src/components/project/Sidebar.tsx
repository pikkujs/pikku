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
  Database,
  Users,
  Sun,
  Moon,
  UserCog,
  ShieldCheck,
  Shield,
  Webhook,
} from 'lucide-react'
import { useState } from 'react'
import { spotlight } from '@mantine/spotlight'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { ImpersonateDrawer } from '../auth/ImpersonateDrawer'
import css from '../ui/console.module.css'

export interface NavItem {
  label: I18nNode
  href: string
  icon: React.ComponentType<{ size?: number; color?: string }>
  matchPrefix: string
}

export interface NavSection {
  title: I18nNode
  items: NavItem[]
}

// Built via a hook so the default nav labels go through t(). Callers can still
// pass their own `sections` prop with already-translated labels.
export function useDefaultNavSections(): NavSection[] {
  useLocale()
  return [
    {
      title: m.nav_run(),
      items: [
        { label: m.nav_functions(), href: '/functions', icon: FunctionSquare, matchPrefix: '/functions' },
        { label: m.nav_workflows(), href: '/workflow', icon: GitBranch, matchPrefix: '/workflow' },
        { label: m.nav_agents(), href: '/agents', icon: Bot, matchPrefix: '/agents' },
        { label: asI18n('Scenarios'), href: '/scenarios', icon: Route, matchPrefix: '/scenarios' },
      ],
    },
    {
      title: m.nav_data(),
      items: [
        { label: m.nav_database(), href: '/database', icon: Database, matchPrefix: '/database' },
        { label: m.nav_apis(), href: '/apis', icon: Globe, matchPrefix: '/apis' },
        { label: m.nav_jobs(), href: '/jobs', icon: Clock, matchPrefix: '/jobs' },
        { label: m.nav_runtime(), href: '/runtime', icon: Server, matchPrefix: '/runtime' },
        { label: m.nav_emails(), href: '/emails', icon: Mail, matchPrefix: '/emails' },
        { label: asI18n('Webhooks'), href: '/webhooks', icon: Webhook, matchPrefix: '/webhooks' },
      ],
    },
    {
      title: m.nav_config(),
      items: [
        { label: m.nav_secrets(), href: '/secrets', icon: KeyRound, matchPrefix: '/secrets' },
        { label: m.nav_env_vars(), href: '/variables', icon: Variable, matchPrefix: '/variables' },
        { label: m.nav_security(), href: '/security', icon: ShieldCheck, matchPrefix: '/security' },
        { label: m.nav_addons(), href: '/addons', icon: Package, matchPrefix: '/addons' },
      ],
    },
    {
      title: m.nav_auth(),
      items: [
        { label: m.nav_users(), href: '/users', icon: Users, matchPrefix: '/users' },
        { label: asI18n('Scopes'), href: '/scopes', icon: Shield, matchPrefix: '/scopes' },
        { label: m.nav_oauth(), href: '/auth-providers', icon: KeyRound, matchPrefix: '/auth-providers' },
        { label: m.nav_credentials(), href: '/credentials', icon: KeyRound, matchPrefix: '/credentials' },
      ],
    },
    {
      title: asI18n(''),
      items: [{ label: m.nav_changes(), href: '/changes', icon: GitCompare, matchPrefix: '/changes' }],
    },
  ]
}

export interface SidebarBranding {
  logo: React.ReactNode
  title: I18nNode
  tooltipLabel: I18nString
  homeHref: string
}

const consoleLogo = (
  import.meta.env.VITE_CONSOLE_LOGO || 'pikku-console-logo.png'
).replace(/^\//, '')

const DEFAULT_BRANDING: SidebarBranding = {
  logo: (
    <img
      src={import.meta.env.BASE_URL + consoleLogo}
      alt={import.meta.env.VITE_CONSOLE_TITLE || 'Pikku Console'}
      width={28}
      height={28}
      style={
        import.meta.env.VITE_CONSOLE_LOGO_INVERT === 'true'
          ? { filter: 'brightness(0) invert(1)' }
          : undefined
      }
    />
  ),
  title: asI18n(import.meta.env.VITE_CONSOLE_TITLE || 'Pikku Console'),
  tooltipLabel: asI18n(import.meta.env.VITE_CONSOLE_TITLE || 'Pikku Console Alpha'),
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
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'sidebar-collapsed',
    defaultValue: false,
  })
  // Collapsible nav sections (like the Fabric rail's accordion groups). We store
  // the *collapsed* titles so a newly-added section defaults to open.
  const [collapsedSections, setCollapsedSections] = useLocalStorage<string[]>({
    key: 'sidebar-collapsed-sections',
    defaultValue: [],
  })
  // Section titles are branded I18n strings; key the collapse set off their
  // string value.
  const isSectionOpen = (title: I18nNode) =>
    !collapsedSections.includes(String(title))
  const toggleSection = (title: I18nNode) =>
    setCollapsedSections((prev) => {
      const key = String(title)
      return prev.includes(key)
        ? prev.filter((t) => t !== key)
        : [...prev, key]
    })
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const auth = useOptionalAuth()
  const canImpersonate = !!auth?.isAdmin
  const [impersonateOpen, setImpersonateOpen] = useState(false)

  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH

  const isActive = (item: NavItem) => pathname.includes(item.matchPrefix)

  return (
    <Box
      pos="fixed"
      left={0}
      top={0}
      w={sidebarWidth}
      h="100vh"
      style={{
        borderRight: `1px solid var(--app-rail-border)`,
        backgroundColor: `var(--app-rail-bg)`,
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 200ms ease',
        overflow: 'hidden',
        zIndex: 100,
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
          const sectionOpen =
            collapsed || !section.title || isSectionOpen(section.title)
          return (
          <Box key={sectionIndex}>
            {sectionIndex > 0 && <Divider my={4} mx="sm" />}
            {section.title && !collapsed && (
              <UnstyledButton
                onClick={() => toggleSection(section.title!)}
                className={css.navSectionHeader}
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
            {sectionOpen && section.items.map((item) => {
              const active = isActive(item)

              if (collapsed) {
                return (
                  <Tooltip key={item.href} label={item.label} position="right">
                    <Box px={6} py={2}>
                      <NavLink
                        component={Link}
                        to={item.href}
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
                          background: active ? 'var(--app-accent-soft)' : undefined,
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
                      borderLeft: `2px solid ${active ? 'var(--app-accent-bar)' : 'transparent'}`,
                      background: active ? 'var(--app-accent-soft)' : undefined,
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
                onClick={() => setImpersonateOpen(true)}
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
            label={colorScheme === 'dark' ? m.sidebar_switch_to_light() : m.sidebar_switch_to_dark()}
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
              {!collapsed && <Text size="sm">{colorScheme === 'dark' ? m.sidebar_light_mode() : m.sidebar_dark_mode()}</Text>}
            </UnstyledButton>
          </Tooltip>
        </Stack>
      </Box>

      {/* Collapse control — mirrors the Fabric rail: a subtle rotating chevron
          pinned as the very last element, on its own footer below a divider,
          distinct from the utility actions above. */}
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

      {canImpersonate && (
        <ImpersonateDrawer
          opened={impersonateOpen}
          onClose={() => setImpersonateOpen(false)}
        />
      )}
    </Box>
  )
}
