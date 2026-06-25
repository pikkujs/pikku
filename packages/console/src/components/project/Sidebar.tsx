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
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Package,
  RefreshCw,
  GitCompare,
  Mail,
  FlaskConical,
  Database,
  Users,
  Sun,
  Moon,
  UserCog,
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
  icon: React.ComponentType<{ size?: number }>
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
        { label: m.nav_tests(), href: '/tests', icon: FlaskConical, matchPrefix: '/tests' },
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
      ],
    },
    {
      title: m.nav_config(),
      items: [
        { label: m.nav_secrets(), href: '/secrets', icon: KeyRound, matchPrefix: '/secrets' },
        { label: m.nav_env_vars(), href: '/variables', icon: Variable, matchPrefix: '/variables' },
        { label: m.nav_addons(), href: '/addons', icon: Package, matchPrefix: '/addons' },
      ],
    },
    {
      title: m.nav_users(),
      items: [
        { label: m.nav_users(), href: '/users', icon: Users, matchPrefix: '/users' },
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
const EXPANDED_WIDTH = 210

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
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()
  const auth = useOptionalAuth()
  // Show impersonation only to an admin session (or when already impersonating).
  const canImpersonate = !!auth && (auth.isAdmin || !!auth.impersonatedBy)
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
        borderRight: `1px solid var(--app-glass-border)`,
        backgroundColor: `var(--mantine-color-body)`,
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
        {sections.map((section, sectionIndex) => (
          <Box key={sectionIndex}>
            {sectionIndex > 0 && <Divider my={4} mx="sm" />}
            {section.title && (
              collapsed ? null : (
                <Text
                  size="xs"
                  fw={600}
                  px="sm"
                  style={{
                    color: 'var(--mantine-color-dimmed)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontSize: 10,
                    paddingTop: 8,
                    paddingBottom: 2,
                  }}
                >
                  {section.title}
                </Text>
              )
            )}
            {section.items.map((item) => {
              const active = isActive(item)

              if (collapsed) {
                return (
                  <Tooltip key={item.href} label={item.label} position="right">
                    <Box px={6} py={2}>
                      <NavLink
                        component={Link}
                        to={item.href}
                        active={active}
                        leftSection={<item.icon size={18} />}
                        variant="light"
                        style={{
                          borderRadius: theme.radius.sm,
                          justifyContent: 'center',
                          padding: '8px 0',
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
                    leftSection={<item.icon size={16} />}
                    active={active}
                    variant="light"
                    style={{
                      borderRadius: theme.radius.sm,
                      fontSize: 13,
                    }}
                  />
                </Box>
              )
            })}
          </Box>
        ))}
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
          <Tooltip
            label={collapsed ? m.sidebar_expand() : m.sidebar_collapse()}
            position="right"
            disabled={!collapsed}
          >
            <UnstyledButton
              onClick={() => setCollapsed(!collapsed)}
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
              {collapsed ? (
                <PanelLeftOpen size={18} />
              ) : (
                <PanelLeftClose size={18} />
              )}
              {!collapsed && <Text size="sm">{m.sidebar_collapse()}</Text>}
            </UnstyledButton>
          </Tooltip>
        </Stack>
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
