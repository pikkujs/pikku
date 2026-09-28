import React from 'react'
import { useLink } from '../router'
import {
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
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
  Network,
  RotateCw,
} from 'lucide-react'
import type { I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { PageContainer, ListPageHeader } from '../components/layout/PageLayout'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { CardsPage } from '../components/ui/CardsPage'
import { PageIntro } from '../components/ui/PageIntro'
import { SectionCard } from '../components/ui/SectionCard'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { DevField, DevFields, DevNote } from '../components/ui/DevDetail'

interface BuildingBlock {
  label: I18nString
  hint: I18nString
  count: number
  icon: React.ComponentType<{ size?: number }>
  href: string
}

const BuildingBlockTile: React.FC<BuildingBlock> = ({
  label,
  hint,
  count,
  icon: Icon,
  href,
}) => {
  const Link = useLink()
  return (
    <Paper
      component={Link}
      to={href}
      variant="inset"
      px="md"
      py="sm"
      miw={0}
      td="none"
      c="inherit"
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <ThemeIcon variant="light" size={36} radius="md">
          <Icon size={18} />
        </ThemeIcon>
        <Stack gap={0} miw={0}>
          <Text
            fz={24}
            fw={700}
            lh={1.2}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {count}
          </Text>
          <Text size="sm" fw={600}>
            {label}
          </Text>
          <Text size="xs" c="dimmed">
            {hint}
          </Text>
        </Stack>
      </Group>
    </Paper>
  )
}

export const OverviewPage: React.FC = () => {
  useLocale()
  const { counts, initialLoading, loading, refresh } = usePikkuMeta()

  if (initialLoading) {
    return <ConsoleLoading h="100vh" />
  }

  const blocks: BuildingBlock[] = [
    {
      label: m.overview_functions(),
      hint: m.overview_functions_hint(),
      count: counts.functions,
      icon: FunctionSquare,
      href: '/functions',
    },
    {
      label: m.overview_workflows(),
      hint: m.overview_workflows_hint(),
      count: counts.workflows,
      icon: GitBranch,
      href: '/workflow',
    },
    {
      label: m.overview_agents(),
      hint: m.overview_agents_hint(),
      count: counts.agents,
      icon: Bot,
      href: '/agents',
    },
    {
      label: m.overview_web_addresses(),
      hint: m.overview_web_addresses_hint(),
      count: counts.httpRoutes,
      icon: Globe,
      href: '/wires/http',
    },
    {
      label: m.overview_live_channels(),
      hint: m.overview_live_channels_hint(),
      count: counts.channels,
      icon: Radio,
      href: '/wires/channel',
    },
    {
      label: m.overview_assistant_tools(),
      hint: m.overview_assistant_tools_hint(),
      count: counts.mcpTools,
      icon: Cpu,
      href: '/wires/mcp',
    },
    {
      label: m.overview_command_line(),
      hint: m.overview_command_line_hint(),
      count: counts.cliCommands,
      icon: Terminal,
      href: '/wires/cli',
    },
    {
      label: m.overview_gateways(),
      hint: m.overview_gateways_hint(),
      count: counts.gateways,
      icon: Network,
      href: '/wires/gateway',
    },
    {
      label: m.overview_schedules(),
      hint: m.overview_schedules_hint(),
      count: counts.schedulers,
      icon: Clock,
      href: '/async/scheduler',
    },
    {
      label: m.overview_queues(),
      hint: m.overview_queues_hint(),
      count: counts.queues,
      icon: ListOrdered,
      href: '/async/queue',
    },
    {
      label: m.overview_emails(),
      hint: m.overview_emails_hint(),
      count: counts.emails,
      icon: Mail,
      href: '/emails',
    },
  ]

  return (
    <PageContainer
      header={
        <ListPageHeader
          title={m.overview_title()}
          description={m.overview_description()}
        />
      }
    >
      <CardsPage>
        <PageIntro
          storageKey="overview"
          eyebrow={m.overview_intro_eyebrow()}
          title={m.overview_intro_title()}
          body={m.overview_intro_body()}
          steps={[
            {
              title: m.overview_intro_step1_title(),
              body: m.overview_intro_step1_body(),
            },
            {
              title: m.overview_intro_step2_title(),
              body: m.overview_intro_step2_body(),
            },
            {
              title: m.overview_intro_step3_title(),
              body: m.overview_intro_step3_body(),
            },
          ]}
          dismissLabel={m.overview_intro_dismiss()}
        />
        <SectionCard
          title={m.overview_made_of_title()}
          blurb={m.overview_made_of_blurb()}
          right={
            <Button
              variant="default"
              leftSection={<RotateCw size={14} />}
              loading={loading}
              onClick={() => void refresh()}
            >
              {m.overview_refresh()}
            </Button>
          }
          testId="overview-blocks"
        >
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm" mt="md">
            {blocks.map((block) => (
              <BuildingBlockTile key={block.href} {...block} />
            ))}
          </SimpleGrid>
        </SectionCard>
        <ForDevelopers
          label={m.overview_dev_label()}
          hint={m.overview_dev_hint()}
          testId="overview-dev"
        >
          <DevNote>{m.overview_dev_body()}</DevNote>
          <DevFields>
            <DevField label={m.dev_rpc()} value="console:getAllMeta" />
            <DevField label={m.dev_source()} value=".pikku/" />
          </DevFields>
        </ForDevelopers>
      </CardsPage>
    </PageContainer>
  )
}
