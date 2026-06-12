import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
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
import { FlaskConical, Play, Search } from 'lucide-react'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { usePikkuRPC, usePikkuSSE } from '../context/PikkuRpcProvider'
import { PanelProvider } from '../context/PanelContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import classes from '../components/ui/console.module.css'

type RunPhase = 'idle' | 'pending' | 'running'
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

export interface CoverageReport {
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


function buildTestsViewData(functions: any[]): {
  report: CoverageReport | null
  scenarios: ScenarioItem[]
} {
  const testedFunctions = functions.filter(
    (fn: any) => fn?.tests?.scenarios?.length > 0 || fn?.tests?.status !== undefined
  )

  if (testedFunctions.length === 0) {
    return { report: null, scenarios: [] }
  }

  const allScenarios: ScenarioItem[] = []
  const covFunctions: FunctionCoverage[] = []
  let latestGeneratedAt: string | null = null

  for (const fn of functions) {
    const cov = fn?.tests
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

export interface TestsPageProps {
  showRunButton?: boolean
  onIncreaseCoverage?: (data: CoverageReport | null) => void
}

type CucumberStatus = 'PASSED' | 'FAILED' | 'SKIPPED' | 'PENDING' | 'UNDEFINED' | 'AMBIGUOUS'

type TestStreamEvent =
  | { type: 'run-start'; scenarios: Array<{ id: string; name: string; uri: string; steps: string[] }> }
  | { type: 'scenario-start'; id: string; name: string; uri: string }
  | { type: 'step'; scenarioId: string; step: string; status: CucumberStatus; duration: number; message?: string }
  | { type: 'scenario-done'; id: string; name: string; status: CucumberStatus }
  | { type: 'done'; coverage: CoverageReport | null }
  | { type: 'error'; message: string }

type LiveStep = {
  step: string
  status: CucumberStatus | 'running'
  duration: number
  message?: string
}

type LiveScenario = {
  id: string
  name: string
  uri: string
  status: CucumberStatus | 'pending' | 'running'
  steps: LiveStep[]
}

const LIVE_STATUS_COLOR: Record<string, string> = {
  running: 'blue',
  PASSED: 'green',
  FAILED: 'red',
  SKIPPED: 'gray',
  PENDING: 'yellow',
  UNDEFINED: 'gray',
  AMBIGUOUS: 'orange',
}

type LiveRunViewProps = { scenarios: LiveScenario[] }

const LiveRunView: React.FC<LiveRunViewProps> = ({ scenarios }) => {
  if (scenarios.length === 0) {
    return (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Running tests…</Text>
        </Stack>
      </Center>
    )
  }

  return (
    <ScrollArea style={{ flex: 1 }}>
      <Stack gap="sm" p="md">
        {scenarios.map((scenario) => {
          const totalMs = scenario.steps.reduce((acc, s) => acc + s.duration, 0)
          const isPending = scenario.status === 'pending'
          const isRunning = scenario.status === 'running'
          const passed = scenario.status === 'PASSED'
          const statusColor = isPending ? 'gray' : isRunning ? 'blue' : passed ? 'green' : 'red'
          const borderLeft = isPending
            ? SCENARIO_STATUS_BORDER.pending
            : isRunning
              ? SCENARIO_STATUS_BORDER.running
              : passed
                ? SCENARIO_STATUS_BORDER.pass
                : SCENARIO_STATUS_BORDER.fail

          return (
            <Box
              key={scenario.id}
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
                  borderBottom: scenario.steps.length > 0
                    ? `1px solid var(--app-border, var(--mantine-color-default-border))`
                    : undefined,
                  background: 'var(--app-surface, var(--mantine-color-default-hover))',
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                    {isPending ? (
                      <Text fz={12} c="dimmed" style={{ lineHeight: 1, flexShrink: 0 }}>○</Text>
                    ) : isRunning ? (
                      <Loader size={12} style={{ flexShrink: 0 }} />
                    ) : (
                      <Text fz={12} fw={700} c={statusColor} style={{ lineHeight: 1, flexShrink: 0 }}>
                        {passed ? '✓' : '✗'}
                      </Text>
                    )}
                    <Text ff="monospace" fz={13} fw={600} truncate>
                      {scenario.name}
                    </Text>
                  </Group>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    {!isRunning && !isPending && scenario.steps.length > 0 && (
                      <Text fz={11} c="dimmed">{totalMs}ms</Text>
                    )}
                    <Badge color={statusColor} variant="light" size="sm">
                      {isPending ? 'Pending' : isRunning ? 'Running' : passed ? 'Pass' : 'Fail'}
                    </Badge>
                  </Group>
                </Group>
              </Box>

              {scenario.steps.length > 0 && (
                <Box p="md">
                  <Stack gap={2} pl="sm" style={{ borderLeft: `3px solid ${borderLeft}` }}>
                    {scenario.steps.map((s, si) => (
                      <HighlightedStep key={si} step={s.step} />
                    ))}
                  </Stack>
                </Box>
              )}
            </Box>
          )
        })}
      </Stack>
    </ScrollArea>
  )
}

export const TestsPage: React.FC<TestsPageProps> = ({ showRunButton, onIncreaseCoverage }) => {
  const { meta, loading, refresh } = usePikkuMeta()
  const rpc = usePikkuRPC()
  const subscribeToSSE = usePikkuSSE()

  const [runPhase, setRunPhase] = useState<RunPhase>('idle')
  const [runError, setRunError] = useState<string | null>(null)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('feature')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [liveScenarios, setLiveScenarios] = useState<LiveScenario[]>([])

  const sseRef = useRef<{ close: () => void } | null>(null)

  const { report, scenarios } = useMemo(
    () => buildTestsViewData(meta.functions),
    [meta.functions]
  )

  useEffect(() => {
    return () => { sseRef.current?.close() }
  }, [])

  const handleRunTests = () => {
    if (runPhase !== 'idle') return
    setRunPhase('running')
    setRunError(null)
    setLiveScenarios([])

    sseRef.current = subscribeToSSE<TestStreamEvent>(
      '/function-tests/stream',
      (event) => {
        if (event.type === 'run-start') {
          setLiveScenarios(
            event.scenarios.map((s) => ({
              id: s.id,
              name: s.name,
              uri: s.uri,
              status: 'pending' as const,
              steps: s.steps.map((step) => ({ step, status: 'running' as const, duration: 0 })),
            }))
          )
        } else if (event.type === 'scenario-start') {
          setLiveScenarios((prev) =>
            prev.map((s) => (s.name === event.name ? { ...s, id: event.id, status: 'running', steps: [] } : s))
          )
        } else if (event.type === 'step') {
          setLiveScenarios((prev) => {
            const idx = prev.findIndex((s) => s.id === event.scenarioId)
            if (idx === -1) return prev
            const updated = [...prev]
            updated[idx] = {
              ...updated[idx],
              steps: [
                ...updated[idx].steps,
                { step: event.step, status: event.status, duration: event.duration, message: event.message },
              ],
            }
            return updated
          })
        } else if (event.type === 'scenario-done') {
          setLiveScenarios((prev) => {
            const idx = prev.findIndex((s) => s.id === event.id)
            if (idx === -1) return prev
            const updated = [...prev]
            updated[idx] = { ...updated[idx], status: event.status }
            return updated
          })
        } else if (event.type === 'done') {
          sseRef.current = null
          setLiveScenarios([])
          void refresh()
          setRunPhase('idle')
        } else if (event.type === 'error') {
          sseRef.current = null
          setRunError(event.message)
          setLiveScenarios([])
          setRunPhase('idle')
        }
      },
      (err) => {
        sseRef.current = null
        setRunError(err instanceof Error ? err.message : 'Failed to run tests')
        setLiveScenarios([])
        setRunPhase('idle')
      }
    )
  }

  const handleIncreaseCoverage = () => {
    if (!rpc || !onIncreaseCoverage) return
    setCoverageLoading(true)
    void rpc
      .invoke('console:getFunctionCoverage' as any, {} as any)
      .then((data) => {
        onIncreaseCoverage(data as CoverageReport | null)
      })
      .catch(() => {
        onIncreaseCoverage(null)
      })
      .finally(() => setCoverageLoading(false))
  }

  const running = runPhase !== 'idle'

  const header = (
    <ListPageHeader
      title="Tests"
      description={
        report?.generatedAt
          ? `Last run: ${formatTestDate(report.generatedAt)}`
          : 'Feature-first view of your test scenarios and function coverage'
      }
      lead={
        showRunButton ? (
          <Group gap="xs">
            <Button
              size="xs"
              leftSection={
                running ? <Loader size={12} color="white" /> : <Play size={14} />
              }
              onClick={handleRunTests}
              disabled={running}
              loading={running}
            >
              {running ? 'Running…' : 'Run tests'}
            </Button>
            {onIncreaseCoverage && (
              <Button
                size="xs"
                variant="default"
                leftSection={<FlaskConical size={14} />}
                onClick={handleIncreaseCoverage}
                disabled={running || coverageLoading || !rpc}
                loading={coverageLoading}
              >
                Increase coverage
              </Button>
            )}
          </Group>
        ) : null
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

  return (
    <PanelProvider>
      <ResizablePanelLayout hidePanel header={header}>
        {runError && (
          <Alert
            color="red"
            title="Test run failed"
            withCloseButton
            onClose={() => setRunError(null)}
            m="md"
          >
            {runError}
          </Alert>
        )}

        {running ? (
          <Box
            className={classes.listSurfaceCard}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            <LiveRunView scenarios={liveScenarios} />
          </Box>
        ) : !report || scenarios.length === 0 ? (
          <EmptyStatePlaceholder
            icon={FlaskConical}
            title="No test data yet"
            description="Run your function tests to populate scenarios here."
            docsHref="https://pikku.dev/docs/core-features/testing"
          />
        ) : (
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
        )}
      </ResizablePanelLayout>
    </PanelProvider>
  )
}
