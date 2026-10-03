import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Anchor, Badge, Button, Code, Group, SimpleGrid, Stack, Text } from '@pikku/mantine/core'
import { Check, Circle, Hammer, Milestone as MilestoneIcon } from 'lucide-react'
import { asI18n, type I18nString } from '@pikku/react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { useSearchParams } from '../router'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'
import { SectionCard } from '../components/ui/SectionCard'
import { CardRow } from '../components/ui/CardRow'
import { StatusBadge, type StatusTone } from '../components/ui/StatusBadge'
import { GherkinBlock } from '../components/ui/GherkinBlock'
import { ForDevelopers } from '../components/ui/ForDevelopers'
import { useBuilderState, type BuilderState } from './BuilderChat'
import { openProjectKey, studioCall, useStudioAction } from './studio'

const DOCS_HREF = 'https://pikku.dev/docs/core-features/knowledge'

type Severity = 'high' | 'medium' | 'low'

interface PageLook {
  route: string
  shots: string[]
  verdict: 'pass' | 'fix' | 'ungraded'
  findings: { severity: Severity; issue: string; fix: string }[]
}

interface MilestoneCheck {
  at: number
  ok: boolean
  stage?: 'verify' | 'plan' | 'scenarios' | 'look'
  report: string
  looks?: PageLook[]
  commit?: string
  attempts?: number
}

interface Milestone {
  path: string
  title: string
  description: string | null
  status: 'proposed' | 'dispatched' | 'built'
  gherkin: string | null
  plan: { items: { id: string; label: string; done: boolean; deferred: boolean }[]; problems: string[] } | null
  check: MilestoneCheck | null
}

const useMilestones = (key: string, busy: boolean) =>
  useQuery({
    queryKey: ['studio', 'milestones', key],
    queryFn: async () => (await studioCall<{ milestones: Milestone[] }>('milestones', { key })).milestones,
    refetchInterval: busy ? 3000 : 15000,
  })

const STATUS: Record<Milestone['status'], { tone: StatusTone; label: () => I18nString }> = {
  proposed: { tone: 'neutral', label: () => m.studio_milestone_waiting() },
  dispatched: { tone: 'info', label: () => m.studio_milestone_building() },
  built: { tone: 'good', label: () => m.studio_milestone_built() },
}

const checkSummary = (check: MilestoneCheck): { tone: StatusTone; text: I18nString } => {
  if (check.ok) return { tone: 'good', text: m.studio_check_passed() }
  if (check.stage === 'verify') return { tone: 'bad', text: m.studio_check_verify() }
  if (check.stage === 'plan') return { tone: 'warn', text: m.studio_check_plan() }
  if (check.stage === 'scenarios') return { tone: 'bad', text: m.studio_check_scenarios() }
  return { tone: 'warn', text: m.studio_check_look() }
}

const planCount = (plan: Milestone['plan']) => {
  const items = plan?.items.filter((item) => !item.deferred) ?? []
  return { done: items.filter((item) => item.done).length, total: items.length }
}

const shotUrl = (key: string, shot: string) => `${window.location.origin}/studio/shot/${key}/${shot.split('/').map(encodeURIComponent).join('/')}`

const SEVERITY_COLOR: Record<Severity, string> = { high: 'red', medium: 'orange', low: 'gray' }

const PageLookCard: React.FC<{ projectKey: string; look: PageLook }> = ({ projectKey, look }) => {
  const [desktop, phone] = look.shots
  const high = look.findings.some((f) => f.severity === 'high')
  return (
    <Stack gap="xs" p="sm" style={{ border: '1px solid var(--app-border)', borderRadius: 10 }} data-testid="milestone-page-look">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={600} size="sm" truncate>
          {asI18n(look.route)}
        </Text>
        <StatusBadge size="sm" tone={look.verdict === 'ungraded' ? 'neutral' : high ? 'warn' : 'good'}>
          {look.verdict === 'ungraded' ? m.studio_look_ungraded() : high ? m.studio_look_fix() : m.studio_look_pass()}
        </StatusBadge>
      </Group>
      <Group gap="xs" align="flex-start" wrap="nowrap">
        {desktop && (
          <Anchor href={shotUrl(projectKey, desktop)} target="_blank" style={{ flex: 3, minWidth: 0 }}>
            <img src={shotUrl(projectKey, desktop)} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--app-border)' }} />
          </Anchor>
        )}
        {phone && (
          <Anchor href={shotUrl(projectKey, phone)} target="_blank" style={{ flex: 1, minWidth: 0 }}>
            <img src={shotUrl(projectKey, phone)} alt="" style={{ width: '100%', borderRadius: 6, border: '1px solid var(--app-border)' }} />
          </Anchor>
        )}
      </Group>
      {look.findings
        .filter((f) => f.severity !== 'low')
        .map((finding, index) => (
          <Stack key={index} gap={2}>
            <Group gap={6} wrap="nowrap" align="flex-start">
              <Badge size="xs" color={SEVERITY_COLOR[finding.severity]} variant="light">
                {finding.severity === 'high' ? m.studio_look_must_fix() : m.studio_look_should_fix()}
              </Badge>
              <Text size="sm">{asI18n(finding.issue)}</Text>
            </Group>
            {finding.fix && (
              <Text size="xs" c="dimmed" pl={4}>
                {asI18n(finding.fix)}
              </Text>
            )}
          </Stack>
        ))}
    </Stack>
  )
}

const MilestoneDetail: React.FC<{ projectKey: string; milestone: Milestone }> = ({ projectKey, milestone }) => {
  const { check, plan } = milestone
  const count = planCount(plan)
  const summary = check ? checkSummary(check) : null
  return (
    <Stack gap="md" data-testid="milestone-detail">
      <SectionCard
        hero
        testId="milestone-summary"
        title={asI18n(milestone.title)}
        badges={<StatusBadge tone={STATUS[milestone.status].tone}>{STATUS[milestone.status].label()}</StatusBadge>}
        blurb={milestone.description ? asI18n(milestone.description) : undefined}
        footer={
          check?.commit ? (
            <Text size="xs" c="dimmed">
              {m.studio_milestone_saved_as({ commit: check.commit })}
            </Text>
          ) : undefined
        }
      />
      {milestone.gherkin && (
        <SectionCard testId="milestone-scenario" title={m.studio_milestone_should_do()} blurb={m.studio_milestone_should_do_blurb()}>
          <GherkinBlock code={milestone.gherkin} />
        </SectionCard>
      )}
      {(plan || milestone.status !== 'built') && <SectionCard
        testId="milestone-plan"
        title={m.studio_milestone_plan()}
        subtitle={plan ? m.studio_milestone_plan_progress({ done: count.done, total: count.total }) : undefined}
        blurb={plan ? m.studio_milestone_plan_blurb() : m.studio_milestone_no_plan()}
      >
        {plan && (
          <Stack gap={6}>
            {plan.items.map((item) => (
              <Group key={item.id} gap={8} wrap="nowrap" style={{ opacity: item.deferred ? 0.55 : 1 }} data-testid="milestone-plan-item">
                {item.done ? <Check size={14} color="var(--mantine-color-green-6)" /> : <Circle size={14} color="var(--mantine-color-dimmed)" />}
                <Text size="sm" style={{ flex: 1 }}>
                  {asI18n(item.label)}
                </Text>
                {item.deferred && (
                  <Badge size="xs" variant="light" color="gray">
                    {m.studio_milestone_later()}
                  </Badge>
                )}
              </Group>
            ))}
            {plan.problems.map((problem, index) => (
              <Text key={index} size="sm" c="red">
                {asI18n(problem)}
              </Text>
            ))}
          </Stack>
        )}
      </SectionCard>}
      <SectionCard
        testId="milestone-check"
        title={m.studio_milestone_last_check()}
        badges={summary ? <StatusBadge tone={summary.tone}>{summary.text}</StatusBadge> : undefined}
        subtitle={
          check
            ? m.studio_milestone_checked({ when: new Date(check.at).toLocaleString(), attempts: check.attempts ?? 1 })
            : undefined
        }
        blurb={check ? undefined : m.studio_milestone_not_checked()}
      >
        {check && (
          <ForDevelopers label={m.studio_milestone_check_output()}>
            <Code block style={{ whiteSpace: 'pre-wrap', maxHeight: 360, overflow: 'auto' }}>
              {check.report}
            </Code>
          </ForDevelopers>
        )}
      </SectionCard>
      {check?.looks && check.looks.length > 0 && (
        <SectionCard testId="milestone-looks" title={m.studio_milestone_pages()} blurb={m.studio_milestone_pages_blurb()}>
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="sm">
            {check.looks.map((look) => (
              <PageLookCard key={look.route} projectKey={projectKey} look={look} />
            ))}
          </SimpleGrid>
        </SectionCard>
      )}
    </Stack>
  )
}

const MilestonesView: React.FC<{ projectKey: string }> = ({ projectKey }) => {
  useLocale()
  const builder = useBuilderState(projectKey)
  const busy = builder.data?.busy ?? false
  const milestones = useMilestones(projectKey, busy)
  const [params, setParams] = useSearchParams()
  const selectedPath = params.get('milestone')
  const client = useQueryClient()
  const prompt = useStudioAction<{ key: string; message: string }, BuilderState>('builderPrompt')
  const list = milestones.data ?? []
  const selected = list.find((milestone) => milestone.path === selectedPath) ?? null
  const built = list.filter((milestone) => milestone.status === 'built').length
  const open = (path: string | null) => {
    const next = new URLSearchParams(params)
    if (path) next.set('milestone', path)
    else next.delete('milestone')
    setParams(next)
  }

  const header = (
    <ListPageHeader
      title={m.nav_milestones()}
      item={selected ? asI18n(selected.title) : undefined}
      onTitle={selected ? () => open(null) : undefined}
      description={list.length ? m.studio_milestones_built_count({ built, total: list.length }) : undefined}
      docsHref={DOCS_HREF}
    />
  )

  if (milestones.isLoading) {
    return (
      <ResizablePanelLayout header={header} hidePanel>
        <ConsoleLoading />
      </ResizablePanelLayout>
    )
  }

  if (list.length === 0) {
    return (
      <ResizablePanelLayout header={header} hidePanel>
        <EmptyStatePlaceholder
          icon={MilestoneIcon}
          title={m.studio_milestones_empty_title()}
          description={m.studio_milestones_empty_body()}
          docsHref={DOCS_HREF}
        />
      </ResizablePanelLayout>
    )
  }

  const next = list.find((milestone) => milestone.status !== 'built')
  return (
    <ResizablePanelLayout header={header} hidePanel surface="cards">
      {selected ? (
        <MilestoneDetail projectKey={projectKey} milestone={selected} />
      ) : (
        <SectionCard
          testId="milestones-list"
          title={m.nav_milestones()}
          blurb={m.studio_milestones_blurb()}
          right={
            next && !busy ? (
              <Button
                leftSection={<Hammer size={15} />}
                loading={prompt.isPending}
                onClick={() =>
                  prompt.mutate(
                    { key: projectKey, message: m.studio_milestones_continue_message() },
                    { onSuccess: (state) => client.setQueryData(['studio', 'builder', projectKey], state) }
                  )
                }
                data-testid="milestones-continue"
              >
                {m.studio_milestones_continue()}
              </Button>
            ) : undefined
          }
        >
          <Stack gap={4}>
            {list.map((milestone, index) => {
              const count = planCount(milestone.plan)
              const summary = milestone.check && milestone.status !== 'built' ? checkSummary(milestone.check) : null
              return (
                <CardRow
                  key={milestone.path}
                  testId="milestone-row"
                  onClick={() => open(milestone.path)}
                  leading={
                    <Text size="sm" c="dimmed" w={20} ta="right">
                      {asI18n(String(index + 1))}
                    </Text>
                  }
                  title={asI18n(milestone.title)}
                  meta={summary ? summary.text : milestone.description ? asI18n(milestone.description) : undefined}
                  badges={<StatusBadge size="sm" tone={STATUS[milestone.status].tone}>{STATUS[milestone.status].label()}</StatusBadge>}
                  trailing={
                    count.total > 0 ? (
                      <Text size="xs" c="dimmed">
                        {m.studio_milestone_plan_progress({ done: count.done, total: count.total })}
                      </Text>
                    ) : undefined
                  }
                />
              )
            })}
          </Stack>
        </SectionCard>
      )}
    </ResizablePanelLayout>
  )
}

export function StudioMilestonesPage() {
  const key = openProjectKey()
  if (!key) return null
  return <MilestonesView projectKey={key} />
}
