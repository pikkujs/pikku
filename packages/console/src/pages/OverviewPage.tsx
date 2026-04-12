import React from 'react'
import { useLink } from '../router'
import {
  Box,
  Container,
  SimpleGrid,
  Paper,
  Text,
  Group,
  Stack,
  Center,
  Loader,
} from '@mantine/core'
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
} from 'lucide-react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

interface StatCardProps {
  label: string
  count: number
  icon: React.ComponentType<{ size?: number }>
  href: string
}

const StatCard: React.FunctionComponent<StatCardProps> = ({
  label,
  count,
  icon: Icon,
  href,
}) => {
  const Link = useLink()
  return (
  <Paper
    component={Link}
    to={href}
    p="md"
    radius="md"
    withBorder
    style={{
      textDecoration: 'none',
      color: 'inherit',
      transition: 'box-shadow 150ms ease, transform 150ms ease',
      cursor: 'pointer',
    }}
    onMouseEnter={(e: React.MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.boxShadow = 'var(--mantine-shadow-md)'
      e.currentTarget.style.transform = 'translateY(-2px)'
    }}
    onMouseLeave={(e: React.MouseEvent<HTMLAnchorElement>) => {
      e.currentTarget.style.boxShadow = ''
      e.currentTarget.style.transform = ''
    }}
  >
    <Group gap="md" wrap="nowrap">
      <Box
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          backgroundColor: 'rgba(255,255,255,0.04)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        <Icon size={20} />
      </Box>
      <Stack gap={0}>
        <Text size="xl" fw={700}>
          {count}
        </Text>
        <Text size="sm" c="dimmed">
          {label}
        </Text>
      </Stack>
    </Group>
  </Paper>
  )
}

export const OverviewPage: React.FunctionComponent = () => {
  const { counts, loading } = usePikkuMeta()

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }

  const stats: StatCardProps[] = [
    {
      label: 'Functions',
      count: counts.functions,
      icon: FunctionSquare,
      href: '/functions',
    },
    {
      label: 'Workflows',
      count: counts.workflows,
      icon: GitBranch,
      href: '/workflow',
    },
    {
      label: 'Agents',
      count: counts.agents,
      icon: Bot,
      href: '/agents',
    },
    {
      label: 'HTTP Routes',
      count: counts.httpRoutes,
      icon: Globe,
      href: '/apis?tab=http',
    },
    {
      label: 'Channels',
      count: counts.channels,
      icon: Radio,
      href: '/apis?tab=channels',
    },
    {
      label: 'MCP Tools',
      count: counts.mcpTools,
      icon: Cpu,
      href: '/apis?tab=mcp',
    },
    {
      label: 'CLI Commands',
      count: counts.cliCommands,
      icon: Terminal,
      href: '/apis?tab=cli',
    },
    {
      label: 'Schedulers',
      count: counts.schedulers,
      icon: Clock,
      href: '/jobs?tab=schedulers',
    },
    {
      label: 'Queues',
      count: counts.queues,
      icon: ListOrdered,
      href: '/jobs?tab=queues',
    },
  ]

  return (
    <Container size="md" py="xl">
      <Stack gap="xl">
        <Box>
          <Text size="xl" fw={700}>
            Overview
          </Text>
          <Text size="sm" c="dimmed">
            Explore your Pikku project metadata
          </Text>
        </Box>
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="md">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  )
}
