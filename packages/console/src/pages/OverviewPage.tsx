import React from 'react'
import { useLink } from '../router'
import {
  Box,
  SimpleGrid,
  Paper,
  Text,
  Group,
  Stack,
  Center,
  Loader,
} from '@pikku/mantine/core'
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
  Mail,
} from 'lucide-react'
import { type I18nString } from '@pikku/react'
import { useI18n } from '@pikku/react/i18n'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'

interface StatCardProps {
  label: I18nString
  count: number
  icon: React.ComponentType<{ size?: number }>
  href: string
}

const StatCard: React.FC<StatCardProps> = ({
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

export const OverviewPage: React.FC = () => {
  const { t } = useI18n()
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
      label: t('overview.functions'),
      count: counts.functions,
      icon: FunctionSquare,
      href: '/functions',
    },
    {
      label: t('overview.workflows'),
      count: counts.workflows,
      icon: GitBranch,
      href: '/workflow',
    },
    {
      label: t('overview.agents'),
      count: counts.agents,
      icon: Bot,
      href: '/agents',
    },
    {
      label: t('overview.http_routes'),
      count: counts.httpRoutes,
      icon: Globe,
      href: '/apis?tab=http',
    },
    {
      label: t('overview.channels'),
      count: counts.channels,
      icon: Radio,
      href: '/apis?tab=channels',
    },
    {
      label: t('overview.mcp_tools'),
      count: counts.mcpTools,
      icon: Cpu,
      href: '/apis?tab=mcp',
    },
    {
      label: t('overview.cli_commands'),
      count: counts.cliCommands,
      icon: Terminal,
      href: '/apis?tab=cli',
    },
    {
      label: t('overview.schedulers'),
      count: counts.schedulers,
      icon: Clock,
      href: '/jobs?tab=schedulers',
    },
    {
      label: t('overview.queues'),
      count: counts.queues,
      icon: ListOrdered,
      href: '/jobs?tab=queues',
    },
    {
      label: t('overview.emails'),
      count: counts.emails,
      icon: Mail,
      href: '/emails',
    },
  ]

  return (
    <PageContainer>
      <ListPageHeader title={t('overview.title')} description={t('overview.description')} />
      <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4 }} spacing="md">
        {stats.map((stat) => (
          <StatCard key={String(stat.label)} {...stat} />
        ))}
      </SimpleGrid>
    </PageContainer>
  )
}
