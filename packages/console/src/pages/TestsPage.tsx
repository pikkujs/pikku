import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { Play, Search } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { TestsHero } from '../components/ui/EmptyStateHeroes'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import classes from '../components/ui/console.module.css'

type RunPhase = 'idle' | 'running'
type GroupBy = 'feature' | 'function'
type StatusFilter = 'all' | 'pass' | 'fail'

interface ScenarioItem {
  featureName: string
  featureDescription: string
  featureFile: string
  scenarioName: string
  steps: string[]
  fn: string
  status: 'pass' | 'fail'
  duration: string
}

interface FunctionCoverage {
  name: string
  sourceFile: string
  exposed: boolean
  description: string | null
  coveredLines: number
  totalLines: number
  missedLines: number[]
  ratio: number
  status: 'covered' | 'partial' | 'uncovered' | 'unknown'
}

interface CoverageReport {
  generatedAt: string | null
  summary: {
    total: number
    covered: number
    partial: number
    uncovered: number
    unknown: number
    overallRatio: number
  }
  functions: FunctionCoverage[]
}

interface FeatureDocument {
  featureName: string
  featureDescription: string
  featureFile: string
  scenarios: ScenarioItem[]
}

const SCENARIO_STATUS_BORDER: Record<string, string> = {
  pass: 'var(--mantine-color-green-6)',
  fail: 'var(--mantine-color-red-6)',
  pending: 'var(--mantine-color-gray-4)',
  running: 'var(--mantine-color-blue-6)',
}

const STATUS_COLOR: Record<string, string> = {
  covered: 'green',
  partial: 'yellow',
  uncovered: 'red',
  unknown: 'gray',
}

function formatTestDate(date: string | null): string {
  if (!date) return 'never'
  try {
    return new Date(date).toLocaleString()
  } catch {
    return date
  }
}

function titleCaseLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getLatestGeneratedAt(functions: any[]): string | null {
  return (
    functions
      .map((fn: any) => fn?.tests?.generatedAt)
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .sort()
      .at(-1) ?? null
  )
}

function buildTestsViewData(functions: any[]): {
  report: CoverageReport | null
  scenarios: ScenarioItem[]
} {
  const testedFunctions = functions.filter(
    (fn: any) => fn?.tests?.scenarios?.length > 0 || fn?.tests?.coverage
  )

  if (testedFunctions.length === 0) {
    return { report: null, scenarios: [] }
  }

  const allScenarios: ScenarioItem[] = []
  const covFunctions: FunctionCoverage[] = []
  let latestGeneratedAt: string | null = null

  for (const fn of functions) {
    const cov = fn?.tests?.coverage
    const fnName: string = fn?.name ?? fn?.funcName ?? fn?.routeName ?? ''

    covFunctions.push({
      name: fnName,
      sourceFile: fn?.sourceFile ?? fn?.filePath ?? '',
      exposed: !!(fn?.httpRoutes?.length || fn?.httpMeta?.length),
      description: fn?.description ?? fn?.summary ?? null,
      coveredLines: cov?.coveredLines ?? 0,
      totalLines: cov?.totalLines ?? 0,
      missedLines: cov?.missedLines ?? [],
      ratio: cov?.ratio ?? 0,
      status: cov?.status ?? 'unknown',
    })

    const genAt: string | undefined = fn?.tests?.generatedAt
    if (genAt && (!latestGeneratedAt || genAt > latestGeneratedAt)) {
      latestGeneratedAt = genAt
    }

    for (const scenario of fn?.tests?.scenarios ?? []) {
      allScenarios.push({
        featureName: scenario?.featureName ?? '',
        featureDescription: scenario?.featureDescription ?? '',
        featureFile: scenario?.featureFile ?? '',
        scenarioName: scenario?.scenarioName ?? scenario?.name ?? '',
        steps: scenario?.steps ?? [],
        fn: fnName,
        status: scenario?.status ?? 'fail',
        duration: scenario?.duration ?? '',
      })
    }
  }

  const covered = covFunctions.filter((f) => f.status === 'covered').length
  const partial = covFunctions.filter((f) => f.status === 'partial').length
  const uncovered = covFunctions.filter((f) => f.status === 'uncovered').length
  const unknown = covFunctions.filter((f) => f.status === 'unknown').length
  const total = covFunctions.length

  const report: CoverageReport = {
    generatedAt: latestGeneratedAt,
    summary: {
      total,
      covered,
      partial,
      uncovered,
      unknown,
      overallRatio: total > 0 ? covered / total : 0,
    },
    functions: covFunctions,
  }

  return { report, scenarios: allScenarios }
}

const GHERKIN_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But']

const HighlightedStep: React.FC<{ step: string }> = ({ step }) => {
  const keyword = GHERKIN_KEYWORDS.find((kw) => step.startsWith(kw + ' '))
  if (!keyword) {
    return (
      <Text component="span" ff="monospace" fz={12} c="var(--app-text, var(--mantine-color-text))">
        {step}
      </Text>
    )
  }
  const rest = step.slice(keyword.length)
  return (
    <Text component="span" ff="monospace" fz={12}>
      <Text
        component="span"
        ff="monospace"
        fz={12}
        fw={600}
        c="var(--mantine-color-blue-5)"
      >
        {keyword}
      </Text>
      <Text
        component="span"
        ff="monospace"
        fz={12}
        c="var(--app-text, var(--mantine-color-text))"
      >
        {rest}
      </Text>
    </Text>
  )
}

type FeatureCodeBlockProps = {
  feature: FeatureDocument
}

const FeatureCodeBlock: React.FC<FeatureCodeBlockProps> = ({ feature }) => {
  const passCount = feature.scenarios.filter((s) => s.status === 'pass').length
  const failCount = feature.scenarios.filter((s) => s.status === 'fail').length

  return (
    <Box
      style={{
        border: `1px solid var(--app-border, var(--mantine-color-default-border))`,
        borderRadius: 8,
        background: 'var(--app-panel-bg, var(--mantine-color-body))',
        overflow: 'hidden',
      }}
    >
      <Box
        px="md"
        py="xs"
        style={{
          borderBottom: `1px solid var(--app-border, var(--mantine-color-default-border))`,
          background: 'var(--app-surface, var(--mantine-color-default-hover))',
        }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Text ff="monospace" fz={13} fw={600} truncate>
            {feature.featureName}
          </Text>
          <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
            {passCount > 0 && (
              <Badge color="green" variant="light" size="sm">
                {passCount} pass
              </Badge>
            )}
            {failCount > 0 && (
              <Badge color="red" variant="light" size="sm">
                {failCount} fail
              </Badge>
            )}
          </Group>
        </Group>
        {feature.featureDescription && (
          <Text fz={12} c="dimmed" mt={2}>
            {feature.featureDescription}
          </Text>
        )}
      </Box>

      <Box p="md">
        <Stack gap="sm">
          {feature.scenarios.map((scenario, idx) => (
            <Box
              key={idx}
              pl="sm"
              style={{
                borderLeft: `3px solid ${SCENARIO_STATUS_BORDER[scenario.status] ?? SCENARIO_STATUS_BORDER.pending}`,
              }}
            >
              <Group justify="space-between" wrap="nowrap" mb={4}>
                <Text fz={13} fw={500} style={{ flex: 1, minWidth: 0 }} truncate>
                  {scenario.scenarioName}
                </Text>
                <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                  {scenario.duration && (
                    <Text fz={11} c="dimmed">
                      {scenario.duration}
                    </Text>
                  )}
                  <Badge
                    color={scenario.status === 'pass' ? 'green' : 'red'}
                    variant="dot"
                    size="sm"
                  >
                    {titleCaseLabel(scenario.status)}
                  </Badge>
                </Group>
              </Group>
              <Stack gap={2}>
                {scenario.steps.map((step, si) => (
                  <HighlightedStep key={si} step={step} />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  )
}

type ScenarioGroupProps = {
  title: string
  subtitle?: string
  status?: FunctionCoverage['status']
  features: FeatureDocument[]
}

const ScenarioGroup: React.FC<ScenarioGroupProps> = ({
  title,
  subtitle,
  status,
  features,
}) => {
  return (
    <Box>
      <Group gap="xs" mb="sm" align="center">
        <Text ff="monospace" fz={14} fw={600}>
          {title}
        </Text>
        {status && (
          <Badge color={STATUS_COLOR[status] ?? 'gray'} variant="light" size="sm">
            {titleCaseLabel(status)}
          </Badge>
        )}
        {subtitle && (
          <Text fz={12} c="dimmed">
            {subtitle}
          </Text>
        )}
      </Group>
      <Stack gap="sm">
        {features.map((feature, idx) => (
          <FeatureCodeBlock key={idx} feature={feature} />
        ))}
      </Stack>
    </Box>
  )
}

type ScenariosViewProps = {
  scenarios: ScenarioItem[]
  report: CoverageReport
  search: string
  groupBy: GroupBy
  statusFilter: StatusFilter
}

const ScenariosView: React.FC<ScenariosViewProps> = ({
  scenarios,
  report,
  search,
  groupBy,
  statusFilter,
}) => {
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return scenarios.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (!q) return true
      return (
        s.featureName.toLowerCase().includes(q) ||
        s.scenarioName.toLowerCase().includes(q) ||
        s.fn.toLowerCase().includes(q) ||
        s.steps.some((step) => step.toLowerCase().includes(q))
      )
    })
  }, [scenarios, search, statusFilter])

  const groups = useMemo(() => {
    if (groupBy === 'feature') {
      const byFeature = new Map<string, FeatureDocument>()
      for (const s of filtered) {
        const key = s.featureFile || s.featureName
        if (!byFeature.has(key)) {
          byFeature.set(key, {
            featureName: s.featureName,
            featureDescription: s.featureDescription,
            featureFile: s.featureFile,
            scenarios: [],
          })
        }
        byFeature.get(key)!.scenarios.push(s)
      }
      return Array.from(byFeature.values()).map((feature) => ({
        title: feature.featureName || feature.featureFile || 'Unknown Feature',
        subtitle: undefined,
        status: undefined as FunctionCoverage['status'] | undefined,
        features: [feature],
      }))
    }

    const byFn = new Map<
      string,
      { cov: FunctionCoverage | undefined; features: Map<string, FeatureDocument> }
    >()

    for (const s of filtered) {
      if (!byFn.has(s.fn)) {
        byFn.set(s.fn, {
          cov: report.functions.find((f) => f.name === s.fn),
          features: new Map(),
        })
      }
      const fnGroup = byFn.get(s.fn)!
      const key = s.featureFile || s.featureName
      if (!fnGroup.features.has(key)) {
        fnGroup.features.set(key, {
          featureName: s.featureName,
          featureDescription: s.featureDescription,
          featureFile: s.featureFile,
          scenarios: [],
        })
      }
      fnGroup.features.get(key)!.scenarios.push(s)
    }

    return Array.from(byFn.entries()).map(([fnName, { cov, features }]) => ({
      title: fnName,
      subtitle: cov?.sourceFile ? `${cov.sourceFile}` : undefined,
      status: cov?.status,
      features: Array.from(features.values()),
    }))
  }, [filtered, groupBy, report.functions])

  if (groups.length === 0) {
    return (
      <Center py="xl">
        <Text c="dimmed" size="sm">
          No scenarios match the current filter.
        </Text>
      </Center>
    )
  }

  return (
    <ScrollArea style={{ flex: 1 }}>
      <Stack gap="xl" p="md">
        {groups.map((group, idx) => (
          <ScenarioGroup
            key={idx}
            title={group.title}
            subtitle={group.subtitle}
            status={group.status}
            features={group.features}
          />
        ))}
      </Stack>
    </ScrollArea>
  )
}

export const TestsPage: React.FC = () => {
  const { meta, loading, refresh } = usePikkuMeta()
  const rpc = usePikkuRPC()

  const [runPhase, setRunPhase] = useState<RunPhase>('idle')
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('feature')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const baseGeneratedAtRef = useRef<string | null>(null)

  const { report, scenarios } = useMemo(
    () => buildTestsViewData(meta.functions),
    [meta.functions]
  )

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => {
    return () => stopPolling()
  }, [])

  const handleRunTests = async () => {
    if (runPhase === 'running') return
    setRunPhase('running')
    baseGeneratedAtRef.current = getLatestGeneratedAt(meta.functions)

    try {
      await rpc.invoke('console:runFunctionTests' as any, {} as any)
    } catch {
      // If the server returns a proxy error while tests are booting, continue polling
    }

    stopPolling()
    pollRef.current = setInterval(async () => {
      await refresh()
      const current = getLatestGeneratedAt(meta.functions)
      if (current && current !== baseGeneratedAtRef.current) {
        stopPolling()
        setRunPhase('idle')
      }
    }, 5000)

    setTimeout(() => {
      stopPolling()
      setRunPhase('idle')
    }, 90_000)
  }

  const header = (
    <ListPageHeader
      title="Tests"
      description={
        report?.generatedAt
          ? `Last run: ${formatTestDate(report.generatedAt)}`
          : 'Feature-first view of your test scenarios and function coverage'
      }
      lead={
        <Button
          size="xs"
          leftSection={
            runPhase === 'running' ? <Loader size={12} color="white" /> : <Play size={14} />
          }
          onClick={handleRunTests}
          disabled={runPhase === 'running'}
          loading={runPhase === 'running'}
        >
          {runPhase === 'running' ? 'Running…' : 'Run tests'}
        </Button>
      }
      filters={
        <TextInput
          placeholder="Search scenarios, features, functions…"
          leftSection={<Search size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size="xs"
          style={{ width: 260 }}
        />
      }
      view={
        <Group gap="xs" wrap="nowrap">
          <Select
            size="xs"
            w={140}
            value={groupBy}
            onChange={(v) => v && setGroupBy(v as GroupBy)}
            allowDeselect={false}
            data={[
              { label: 'Group by feature', value: 'feature' },
              { label: 'Group by function', value: 'function' },
            ]}
          />
          <SegmentedControl
            size="xs"
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Pass', value: 'pass' },
              { label: 'Fail', value: 'fail' },
            ]}
          />
        </Group>
      }
    />
  )

  if (loading) {
    return (
      <PanelProvider>
        <ResizablePanelLayout hidePanel header={header}>
          <Center h="100%">
            <Loader />
          </Center>
        </ResizablePanelLayout>
      </PanelProvider>
    )
  }

  if (!report || scenarios.length === 0) {
    return (
      <PanelProvider>
        <ResizablePanelLayout hidePanel header={header}>
          <EmptyStatePlaceholder
            hero={<TestsHero />}
            title="No test data yet"
            description="Run your function tests to populate scenarios here."
            docsHref="https://pikku.dev/docs/core-features/testing"
          />
        </ResizablePanelLayout>
      </PanelProvider>
    )
  }

  return (
    <PanelProvider>
      <ResizablePanelLayout hidePanel header={header}>
        <Box
          className={classes.listSurfaceCard}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
          <ScenariosView
            scenarios={scenarios}
            report={report}
            search={search}
            groupBy={groupBy}
            statusFilter={statusFilter}
          />
        </Box>
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
