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
import { useI18n } from '@pikku/react/i18n'
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
} from 'lucide-react'
import { spotlight } from '@mantine/spotlight'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
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

export const DEFAULT_NAV_SECTIONS: NavSection[] = [
  {
    title: asI18n('Run'),
    items: [
      {
        label: asI18n('Functions'),
        href: '/functions',
        icon: FunctionSquare,
        matchPrefix: '/functions',
      },
      {
        label: asI18n('Workflows'),
        href: '/workflow',
        icon: GitBranch,
        matchPrefix: '/workflow',
      },
      {
        label: asI18n('Agents'),
        href: '/agents',
        icon: Bot,
        matchPrefix: '/agents',
      },
      {
        label: asI18n('Tests'),
        href: '/tests',
        icon: FlaskConical,
        matchPrefix: '/tests',
      },
    ],
  },
  {
    title: asI18n('Data'),
    items: [
      {
        label: asI18n('Database'),
        href: '/database',
        icon: Database,
        matchPrefix: '/database',
      },
      {
        label: asI18n('APIs'),
        href: '/apis',
        icon: Globe,
        matchPrefix: '/apis',
      },
      {
        label: asI18n('Jobs'),
        href: '/jobs',
        icon: Clock,
        matchPrefix: '/jobs',
      },
      {
        label: asI18n('Runtime'),
        href: '/runtime',
        icon: Server,
        matchPrefix: '/runtime',
      },
      {
        label: asI18n('Emails'),
        href: '/emails',
        icon: Mail,
        matchPrefix: '/emails',
      },
    ],
  },
  {
    title: asI18n('Config'),
    items: [
      {
        label: asI18n('Secrets'),
        href: '/secrets',
        icon: KeyRound,
        matchPrefix: '/secrets',
      },
      {
        label: asI18n('Environment Variables'),
        href: '/variables',
        icon: Variable,
        matchPrefix: '/variables',
      },
      {
        label: asI18n('Addons'),
        href: '/addons',
        icon: Package,
        matchPrefix: '/addons',
      },
    ],
  },
  {
    title: asI18n('Users'),
    items: [
      {
        label: asI18n('OAuth'),
        href: '/users',
        icon: Users,
        matchPrefix: '/users',
      },
      {
        label: asI18n('Credentials'),
        href: '/credentials',
        icon: KeyRound,
        matchPrefix: '/credentials',
      },
    ],
  },
  {
    title: asI18n(''),
    items: [
      {
        label: asI18n('Changes'),
        href: '/changes',
        icon: GitCompare,
        matchPrefix: '/changes',
      },
    ],
  },
]

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
  sections = DEFAULT_NAV_SECTIONS,
  branding = DEFAULT_BRANDING,
  footer,
}) => {
  const Link = useLink()
  const { t } = useI18n()
  const theme = useMantineTheme()
  const { pathname } = useLocation()
  const { refresh, loading: metaLoading } = usePikkuMeta()
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'sidebar-collapsed',
    defaultValue: false,
  })
  const { colorScheme, toggleColorScheme } = useMantineColorScheme()

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
          <Tooltip label={t('sidebar.search')}>
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
          <Tooltip
            label={t('sidebar.refreshMetadata')}
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
              {!collapsed && <Text size="sm">{t('sidebar.refresh')}</Text>}
            </UnstyledButton>
          </Tooltip>
          <Tooltip
            label={colorScheme === 'dark' ? t('sidebar.switchToLight') : t('sidebar.switchToDark')}
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
              {!collapsed && <Text size="sm">{colorScheme === 'dark' ? t('sidebar.lightMode') : t('sidebar.darkMode')}</Text>}
            </UnstyledButton>
          </Tooltip>
          <Tooltip
            label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
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
              {!collapsed && <Text size="sm">{t('sidebar.collapse')}</Text>}
            </UnstyledButton>
          </Tooltip>
        </Stack>
      </Box>
    </Box>
  )
}
