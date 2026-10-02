import React from 'react'
import { ActionIcon, Group, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nNode } from '@pikku/react'
import {
  Boxes,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Info,
  ListChecks,
  MonitorSmartphone,
  Server,
  TriangleAlert,
} from 'lucide-react'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { plural } from '@/i18n/plural'
import type {
  CheckFinding,
  CheckResult,
  CheckStep,
} from '../../hooks/useChecks'
import { runAgo } from '../scenarios/runs/scenario-run-format'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import { StatusBadge, type StatusTone } from '../ui/StatusBadge'
import { ForDevelopers } from '../ui/ForDevelopers'
import {
  DevCode,
  DevField,
  DevFields,
  DevNote,
  devSourcePath,
} from '../ui/DevDetail'

type Severity = CheckFinding['severity']

type Copy = { title: () => I18nNode; about: () => I18nNode }

const KNOWN: Record<string, Copy> = {
  'orphaned-child-route': {
    title: m.checks_kind_orphan_title,
    about: m.checks_kind_orphan_about,
  },
  'dataless-detail-route': {
    title: m.checks_kind_dataless_title,
    about: m.checks_kind_dataless_about,
  },
  'as-i18n-misuse': {
    title: m.checks_kind_wording_title,
    about: m.checks_kind_wording_about,
  },
  'stale-table-zod': {
    title: m.checks_kind_stale_title,
    about: m.checks_kind_stale_about,
  },
  'broken-message-catalog': {
    title: m.checks_kind_catalog_title,
    about: m.checks_kind_catalog_about,
  },
  'codegen-timeout': {
    title: m.checks_kind_timeout_title,
    about: m.checks_kind_timeout_about,
  },
  'typecheck-timeout': {
    title: m.checks_kind_timeout_title,
    about: m.checks_kind_timeout_about,
  },
}

const byStep = (finding: CheckFinding): Copy => {
  switch (finding.step) {
    case 'typecheck':
      return {
        title: m.checks_kind_server_title,
        about: m.checks_kind_server_about,
      }
    case 'frontend-typecheck':
      return {
        title: m.checks_kind_screens_title,
        about: m.checks_kind_screens_about,
      }
    case 'codegen':
      return finding.severity === 'error'
        ? { title: m.checks_kind_setup_title, about: m.checks_kind_setup_about }
        : {
            title: m.checks_kind_setup_minor_title,
            about: m.checks_kind_setup_minor_about,
          }
    default:
      return {
        title: m.checks_kind_other_title,
        about: m.checks_kind_other_about,
      }
  }
}

/** Findings of one kind, the unit an owner reads and opens. */
export type CheckProblem = Copy & {
  key: string
  severity: Severity
  findings: CheckFinding[]
}

export const groupProblems = (findings: CheckFinding[]): CheckProblem[] => {
  const problems = new Map<string, CheckProblem>()
  for (const finding of findings) {
    const known = KNOWN[finding.id]
    const key = known
      ? `${finding.severity}.${finding.id}`
      : `${finding.severity}.${finding.step}`
    const problem = problems.get(key) ?? {
      key,
      severity: finding.severity,
      findings: [],
      ...(known ?? byStep(finding)),
    }
    problem.findings.push(finding)
    problems.set(key, problem)
  }
  return [...problems.values()]
}

export const SEVERITY_TONE: Record<Severity, StatusTone> = {
  error: 'bad',
  warn: 'warn',
  info: 'info',
}

export const severityLabel = (severity: Severity) =>
  severity === 'error'
    ? m.checks_status_broken()
    : severity === 'warn'
      ? m.checks_status_minor()
      : m.checks_status_info()

const SEVERITY_ICON = {
  error: CircleAlert,
  warn: TriangleAlert,
  info: Info,
} as const

const GROUPS: { severity: Severity; blurb: () => I18nNode }[] = [
  { severity: 'error', blurb: m.checks_group_broken_blurb },
  { severity: 'warn', blurb: m.checks_group_minor_blurb },
  { severity: 'info', blurb: m.checks_group_info_blurb },
]

const frontendName = (target?: string) =>
  target?.split('/').filter(Boolean).pop() ?? ''

const STEP_ICON = {
  checks: ListChecks,
  codegen: Boxes,
  typecheck: Server,
  'frontend-typecheck': MonitorSmartphone,
} as const

const stepTitle = (step: CheckStep): I18nNode => {
  switch (step.id) {
    case 'checks':
      return m.checks_step_checks()
    case 'codegen':
      return m.checks_step_codegen()
    case 'typecheck':
      return m.checks_step_typecheck()
    case 'frontend-typecheck':
      return m.checks_step_frontend({ name: frontendName(step.target) })
  }
}

const stepAbout = (step: CheckStep): I18nNode => {
  switch (step.id) {
    case 'checks':
      return m.checks_step_checks_about()
    case 'codegen':
      return m.checks_step_codegen_about()
    case 'typecheck':
      return m.checks_step_typecheck_about()
    case 'frontend-typecheck':
      return m.checks_step_frontend_about()
  }
}

const skippedWhy = (reason: string): I18nNode => {
  if (reason === 'disabled') return m.checks_skipped_disabled()
  if (reason === 'codegen failed') return m.checks_skipped_codegen()
  if (reason.includes('message catalog')) return m.checks_skipped_catalog()
  if (reason.includes('not installed')) return m.checks_skipped_not_installed()
  return m.checks_skipped_other()
}

const StepRow: React.FC<{ step: CheckStep }> = ({ step }) => {
  const Icon = STEP_ICON[step.id]
  const tone: StatusTone = step.skipped ? 'neutral' : step.ok ? 'good' : 'bad'
  return (
    <CardRow
      testId={`checks-step-${step.id}`}
      leading={
        <StatusTile tone={tone}>
          <Icon size={18} />
        </StatusTile>
      }
      title={stepTitle(step)}
      badges={
        <StatusBadge tone={tone} size="sm">
          {step.skipped
            ? m.checks_step_skipped()
            : step.ok
              ? m.checks_step_passed()
              : m.checks_step_problems()}
        </StatusBadge>
      }
      meta={step.skipped ? skippedWhy(step.skipped) : stepAbout(step)}
    />
  )
}

const ProblemRow: React.FC<{
  problem: CheckProblem
  selected: boolean
  onOpen: () => void
}> = ({ problem, selected, onOpen }) => {
  const Icon = SEVERITY_ICON[problem.severity]
  const places = problem.findings.length
  return (
    <CardRow
      testId={`checks-problem-${problem.key}`}
      onClick={onOpen}
      selected={selected}
      leading={
        <StatusTile tone={SEVERITY_TONE[problem.severity]}>
          <Icon size={18} />
        </StatusTile>
      }
      title={problem.title()}
      badges={
        places > 1 ? (
          <StatusBadge tone="neutral" size="sm" dot={false}>
            {plural(places, m.checks_places_one, m.checks_places)}
          </StatusBadge>
        ) : undefined
      }
      meta={problem.about()}
      trailing={
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={m.checks_open({ name: String(problem.title()) })}
          onClick={onOpen}
        >
          <ChevronRight size={16} />
        </ActionIcon>
      }
    />
  )
}

const startedIso = (result: CheckResult) =>
  new Date(result.startedAt).toISOString()

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

/** The overview of the last check: how the app is doing, what needs attention, and what was looked at. */
export const ChecksOverviewCards: React.FC<{
  result: CheckResult | null
  running: boolean
  error: unknown
  selectedKey: string | null
  onOpen: (key: string) => void
}> = ({ result, running, error, selectedKey, onOpen }) => {
  const { locale } = useLocale()
  const problems = groupProblems(result?.findings ?? [])
  const broken = problems.some((p) => p.severity === 'error')
  const lastChecked = result
    ? m.checks_last_checked({ ago: runAgo(startedIso(result), locale) })
    : null

  const hero = running ? (
    <SectionCard
      hero
      testId="checks-hero"
      title={m.checks_running_title()}
      badges={
        <StatusBadge tone="info">{m.checks_status_checking()}</StatusBadge>
      }
      blurb={
        result ? m.checks_running_blurb_previous() : m.checks_running_blurb()
      }
    >
      {lastChecked && (
        <Text size="sm" c="dimmed" mt="md">
          {lastChecked}
        </Text>
      )}
    </SectionCard>
  ) : error ? (
    <SectionCard
      hero
      testId="checks-hero"
      title={m.checks_failed_title()}
      badges={<StatusBadge tone="bad">{m.checks_status_failed()}</StatusBadge>}
      blurb={m.checks_failed_blurb()}
    >
      {lastChecked && (
        <Text size="sm" c="dimmed" mt="md">
          {lastChecked}
        </Text>
      )}
    </SectionCard>
  ) : (
    <SectionCard
      hero
      testId="checks-hero"
      title={
        problems.length === 0
          ? m.checks_healthy_title()
          : plural(problems.length, m.checks_attention_one, m.checks_attention)
      }
      badges={
        problems.length === 0 ? (
          <StatusBadge tone="good">{m.checks_status_healthy()}</StatusBadge>
        ) : (
          <StatusBadge tone={broken ? 'bad' : 'warn'}>
            {broken ? m.checks_status_broken() : m.checks_status_minor()}
          </StatusBadge>
        )
      }
      blurb={
        problems.length === 0
          ? m.checks_healthy_blurb()
          : broken
            ? m.checks_attention_blurb_broken()
            : m.checks_attention_blurb_minor()
      }
    >
      {lastChecked && (
        <Group gap={8} mt="md" c="dimmed">
          {problems.length === 0 && <CircleCheck size={14} />}
          <Text size="sm">{lastChecked}</Text>
        </Group>
      )}
    </SectionCard>
  )

  return (
    <>
      {hero}

      {GROUPS.map(({ severity, blurb }) => {
        const rows = problems.filter((p) => p.severity === severity)
        if (rows.length === 0) return null
        return (
          <SectionCard
            key={severity}
            testId={`checks-group-${severity}`}
            title={severityLabel(severity)}
            blurb={blurb()}
          >
            <Stack gap="xs" mt="md">
              {rows.map((problem) => (
                <ProblemRow
                  key={problem.key}
                  problem={problem}
                  selected={problem.key === selectedKey}
                  onOpen={() => onOpen(problem.key)}
                />
              ))}
            </Stack>
          </SectionCard>
        )
      })}

      {result && result.steps.length > 0 && (
        <SectionCard
          testId="checks-steps"
          title={m.checks_steps_title()}
          blurb={m.checks_steps_blurb()}
        >
          <Stack gap="xs" mt="md">
            {result.steps.map((step) => (
              <StepRow key={`${step.id}.${step.target ?? ''}`} step={step} />
            ))}
          </Stack>
        </SectionCard>
      )}

      <ForDevelopers testId="checks-developers" hint={m.checks_dev_hint_run()}>
        {result && (
          <DevFields>
            <DevField label={m.checks_dev_project()} value={result.rootDir} />
            <DevField
              label={m.checks_dev_started()}
              value={startedIso(result)}
            />
            <DevField
              label={m.checks_dev_duration()}
              value={seconds(result.durationMs)}
              copy={false}
            />
          </DevFields>
        )}
        {error ? (
          <DevField label={m.checks_dev_error()} value={errorText(error)} />
        ) : null}
        <DevCode label={m.checks_dev_run()} code="pikku verify" />
        <DevNote>{m.checks_dev_skips_codegen()}</DevNote>
      </ForDevelopers>
    </>
  )
}

const place = (finding: CheckFinding) =>
  finding.file ? devSourcePath(finding.file, finding.line) : ''

const forPasting = (problem: CheckProblem) =>
  problem.findings
    .map((f) =>
      [
        `${place(f) ? `${place(f)}  ` : ''}[${f.id}${f.code ? ` ${f.code}` : ''}] ${f.message}`,
        f.hint ? `fix: ${f.hint}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    )
    .join('\n\n')

/** One problem's places, opened beside the overview. */
export const CheckProblemDetail: React.FC<{ problem: CheckProblem }> = ({
  problem,
}) => {
  const places = problem.findings.length
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Group gap={8}>
          <StatusBadge tone={SEVERITY_TONE[problem.severity]} size="sm">
            {severityLabel(problem.severity)}
          </StatusBadge>
        </Group>
        <Text size="sm">{problem.about()}</Text>
        <Text size="sm" c="dimmed">
          {plural(places, m.checks_found_in_one, m.checks_found_in)}
        </Text>
      </Stack>
      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {m.checks_what_to_do()}
        </Text>
        <Text size="sm">
          {problem.severity === 'error'
            ? m.checks_todo_broken()
            : problem.severity === 'warn'
              ? m.checks_todo_minor()
              : m.checks_todo_info()}
        </Text>
      </Stack>
      <ForDevelopers
        testId="checks-problem-developers"
        hint={m.checks_dev_hint()}
      >
        {problem.findings.map((finding, index) => (
          <Stack
            key={`${finding.file ?? ''}:${finding.line ?? index}:${index}`}
            gap="xs"
          >
            <DevFields>
              {finding.file && (
                <DevField label={m.checks_dev_file()} value={place(finding)} />
              )}
              <DevField
                label={m.checks_dev_check()}
                value={finding.id}
                copy={false}
              />
              {finding.code && finding.code !== finding.id && (
                <DevField
                  label={m.checks_dev_code()}
                  value={finding.code}
                  copy={false}
                />
              )}
            </DevFields>
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
              {asI18n(finding.message)}
            </Text>
            {finding.hint && <DevNote>{asI18n(finding.hint)}</DevNote>}
          </Stack>
        ))}
        <DevCode
          label={m.checks_dev_copy_all()}
          code={forPasting(problem)}
          language="markdown"
        />
      </ForDevelopers>
    </Stack>
  )
}
