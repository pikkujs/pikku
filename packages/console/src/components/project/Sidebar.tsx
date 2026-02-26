import { useLocation, Link } from 'react-router-dom'
import {
  Stack,
  Box,
  Text,
  useMantineTheme,
  Tooltip,
  NavLink,
  Divider,
  ActionIcon,
} from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import {
  FunctionSquare,
  GitBranch,
  Bot,
  Globe,
  Radio,
  Cpu,
  Terminal,
  Clock,
  ListOrdered,
  Zap,
  Server,
  Layers,
  Shield,
  KeyRound,
  Settings2,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Package,
} from 'lucide-react'
import { spotlight } from '@mantine/spotlight'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number }>
  matchPrefix: string
}

interface NavSection {
  title?: string
  items: NavItem[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      {
        label: 'Functions',
        href: '/functions',
        icon: FunctionSquare,
        matchPrefix: '/functions',
      },
      {
        label: 'Workflows',
        href: '/workflow',
        icon: GitBranch,
        matchPrefix: '/workflow',
      },
      {
        label: 'Agents',
        href: '/agents',
        icon: Bot,
        matchPrefix: '/agents',
      },
    ],
  },
  {
    title: 'Config',
    items: [
      {
        label: 'Secrets',
        href: '/config/secrets',
        icon: KeyRound,
        matchPrefix: '/config/secrets',
      },
      {
        label: 'Variables',
        href: '/config/variables',
        icon: Settings2,
        matchPrefix: '/config/variables',
      },
    ],
  },
  {
    title: 'APIs',
    items: [
      {
        label: 'HTTP',
        href: '/apis/http',
        icon: Globe,
        matchPrefix: '/apis/http',
      },
      {
        label: 'Channels',
        href: '/apis/channels',
        icon: Radio,
        matchPrefix: '/apis/channels',
      },
      {
        label: 'MCP',
        href: '/apis/mcp',
        icon: Cpu,
        matchPrefix: '/apis/mcp',
      },
      {
        label: 'CLI',
        href: '/apis/cli',
        icon: Terminal,
        matchPrefix: '/apis/cli',
      },
    ],
  },
  {
    title: 'Jobs',
    items: [
      {
        label: 'Schedulers',
        href: '/jobs/schedulers',
        icon: Clock,
        matchPrefix: '/jobs/schedulers',
      },
      {
        label: 'Queues',
        href: '/jobs/queues',
        icon: ListOrdered,
        matchPrefix: '/jobs/queues',
      },
      {
        label: 'Triggers',
        href: '/jobs/triggers',
        icon: Zap,
        matchPrefix: '/jobs/triggers',
      },
    ],
  },
  {
    title: 'Runtime',
    items: [
      {
        label: 'Services',
        href: '/runtime/services',
        icon: Server,
        matchPrefix: '/runtime/services',
      },
      {
        label: 'Middleware',
        href: '/runtime/middleware',
        icon: Layers,
        matchPrefix: '/runtime/middleware',
      },
      {
        label: 'Permissions',
        href: '/runtime/permissions',
        icon: Shield,
        matchPrefix: '/runtime/permissions',
      },
    ],
  },
  {
    title: 'Addons',
    items: [
      {
        label: 'Addons',
        href: '/addons',
        icon: Package,
        matchPrefix: '/addons',
      },
    ],
  },
]

const COLLAPSED_WIDTH = 60
const EXPANDED_WIDTH = 210

export const SIDEBAR_COLLAPSED_WIDTH = COLLAPSED_WIDTH
export const SIDEBAR_EXPANDED_WIDTH = EXPANDED_WIDTH

export const Sidebar: React.FunctionComponent = () => {
  const theme = useMantineTheme()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'sidebar-collapsed',
    defaultValue: false,
  })

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
        borderRight: `1px solid var(--mantine-color-default-border)`,
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
          label="Pikku Console Alpha"
          position="right"
          disabled={!collapsed}
        >
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <img
              src="/pikku-console-logo.png"
              alt="Pikku Console"
              width={28}
              height={28}
            />
            {!collapsed && (
              <Text size="lg" fw={500}>
                Pikku Console
              </Text>
            )}
          </Link>
        </Tooltip>
        {!collapsed && (
          <Tooltip label="Search (⌘K)">
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
        {NAV_SECTIONS.map((section, sectionIndex) => (
          <Box key={sectionIndex}>
            {sectionIndex > 0 && <Divider my={4} mx="sm" />}
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

      <Box style={{ flexShrink: 0 }}>
        <Divider mx="sm" />
        <Box px={6} py={4}>
          {collapsed ? (
            <Stack gap={2} align="center">
              <Tooltip label="Settings" position="right">
                <NavLink
                  component={Link}
                  to="/settings"
                  active={pathname.includes('/settings')}
                  leftSection={<Settings size={18} />}
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
              </Tooltip>
              <Tooltip label="Expand sidebar" position="right">
                <ActionIcon
                  variant="subtle"
                  size="md"
                  color="gray"
                  onClick={() => setCollapsed(false)}
                >
                  <PanelLeftOpen size={16} />
                </ActionIcon>
              </Tooltip>
            </Stack>
          ) : (
            <Box
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box style={{ flex: 1 }}>
                <NavLink
                  component={Link}
                  to="/settings"
                  label="Settings"
                  leftSection={<Settings size={16} />}
                  active={pathname.includes('/settings')}
                  variant="light"
                  style={{
                    borderRadius: theme.radius.sm,
                    fontSize: 13,
                  }}
                />
              </Box>
              <Tooltip label="Collapse sidebar">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color="gray"
                  onClick={() => setCollapsed(true)}
                >
                  <PanelLeftClose size={16} />
                </ActionIcon>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
