import React, { useCallback, useMemo, useState } from 'react'
import {
  Accordion,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
} from '@pikku/mantine/core'
import { Package } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import type {
  SecurityAuditReport,
  SecurityAuditIssue,
} from '../../hooks/useSecurityAudit'
import {
  SEV_ORDER,
  SEV_COLOR,
  SEV_LABEL,
  emptyCounts,
  buildDeps,
  resolveSelection,
  type DepInfo,
  type RenderUpgradeAction,
} from './security-view-utils'
import { buildUpgradePrompt, isUpgradable } from './upgrade-prompt'
import { CopyUpgradePromptButton } from './CopyUpgradePromptButton'
import { SeverityDot } from './SeverityDot'
import { FindingItem } from './FindingItem'
import { DependencyRow } from './DependencyRow'
import { CleanState } from './CleanState'
import { UpdateDependencyButton } from './UpdateDependencyButton'

export type SecurityLens = 'issues' | 'dependencies'

export interface SecurityAuditViewProps {
  report: SecurityAuditReport
  lens: SecurityLens
  query: string
  // The action offered for a selected package set, in a finding row and beneath
  // a multi-package selection. OSS bumps package.json for one and copies a
  // prompt for many; Fabric passes its own sandbox-verified action here.
  renderUpgradeAction?: RenderUpgradeAction
}

// The default OSS action — bump package.json + bun install for a single
// package, and for a selection the prompt to hand another agent, since the
// console has no sandbox to verify a multi-package upgrade in.
const defaultUpgradeAction: RenderUpgradeAction = ({ deps, prompt }) => {
  const only = deps.length === 1 ? deps[0] : undefined
  return only?.latest ? (
    <UpdateDependencyButton pkg={only.name} version={only.latest} />
  ) : (
    <CopyUpgradePromptButton prompt={prompt} />
  )
}

// Stable, collision-free identity for a finding — advisoryId can be empty.
const issueKey = (issue: SecurityAuditIssue, idx: number) =>
  `${issue.package}@${issue.advisoryId || issue.url || idx}`

export const SecurityAuditView: React.FC<SecurityAuditViewProps> = ({
  report,
  lens,
  query,
  renderUpgradeAction = defaultUpgradeAction,
}) => {
  const [vulnerableOnly, setVulnerableOnly] = useState(true)
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set())
  const deps = useMemo(() => buildDeps(report), [report])
  const depsByName = useMemo(
    () => new Map(deps.map((d) => [d.name, d])),
    [deps]
  )
  const upgrade = useCallback(
    (selection: DepInfo[]) =>
      renderUpgradeAction({
        deps: selection,
        prompt: buildUpgradePrompt(selection, report),
      }),
    [renderUpgradeAction, report]
  )
  const renderUpgradeFor = useCallback(
    (pkg: string) => {
      const dep = depsByName.get(pkg)
      return dep ? upgrade([dep]) : null
    },
    [depsByName, upgrade]
  )
  const latestOf = useMemo(() => {
    const map = new Map<string, string | undefined>()
    deps.forEach((d) => map.set(d.name, d.latest))
    return map
  }, [deps])
  const counts = useMemo(() => {
    const c = emptyCounts()
    report.issues.forEach((i) => c[i.severity]++)
    return c
  }, [report])

  // A note means the audit could not run (e.g. unsupported package manager) —
  // show only that, never the reassuring "no vulnerabilities" sections. (Kept
  // below the hooks so hook order stays stable across renders.)
  if (report.note) {
    return (
      <Stack gap="xs" data-testid="security-audit">
        <Badge color="yellow" variant="light" data-testid="security-not-run">
          {m.security_not_run()}
        </Badge>
        <Text c="dimmed" data-testid="security-note">
          {asI18n(report.note)}
        </Text>
      </Stack>
    )
  }

  const ql = query.trim().toLowerCase()
  const issueMatch = (i: SecurityAuditIssue) =>
    !ql ||
    i.package.toLowerCase().includes(ql) ||
    i.title.toLowerCase().includes(ql) ||
    i.advisoryId.toLowerCase().includes(ql) ||
    i.cwe.some((c) => c.toLowerCase().includes(ql))

  const filteredIssues = report.issues.filter(issueMatch)
  const grouped = SEV_ORDER.map((sev) => ({
    sev,
    items: filteredIssues.filter((i) => i.severity === sev),
  })).filter((g) => g.items.length > 0)

  const depsShown = deps.filter(
    (d) =>
      (!vulnerableOnly || d.total > 0) &&
      (!ql || d.name.toLowerCase().includes(ql))
  )

  const affected = deps.filter((d) => d.total > 0).length
  const {
    selectable,
    selected: selectedDeps,
    allShownSelected,
    someShownSelected,
  } = resolveSelection(deps, depsShown, selectedNames, isUpgradable)
  const toggle = (name: string, on: boolean) =>
    setSelectedNames((prev) => {
      const next = new Set(prev)
      if (on) next.add(name)
      else next.delete(name)
      return next
    })
  const toggleShown = (on: boolean) =>
    setSelectedNames((prev) => {
      const next = new Set(prev)
      for (const d of selectable) {
        if (on) next.add(d.name)
        else next.delete(d.name)
      }
      return next
    })

  return (
    <Stack gap="lg" data-testid="security-audit">
      {/* status strip */}
      <Paper withBorder radius="md" p="sm">
        <Group gap="md" justify="space-between" wrap="wrap">
          <Group gap={8} align="center">
            <Package size={14} />
            <Text span size="sm" c="dimmed">
              {m.security_audited_by({ tool: report.tool })}
            </Text>
            <Text span size="sm" c="dimmed" ff="monospace">
              {m.security_advisories_count({ count: report.issues.length })}
            </Text>
            <Text span size="sm" c="dimmed" ff="monospace">
              {m.security_packages_affected({
                affected,
                total: deps.length,
              })}
            </Text>
          </Group>
          <Group gap={6} align="center">
            {SEV_ORDER.filter((s) => counts[s] > 0).map((s) => (
              <Badge
                key={s}
                color={SEV_COLOR[s]}
                variant="light"
                leftSection={<SeverityDot sev={s} />}
              >
                {asI18n(`${counts[s]} ${SEV_LABEL[s]()}`)}
              </Badge>
            ))}
          </Group>
        </Group>
      </Paper>

      {lens === 'issues' ? (
        grouped.length === 0 ? (
          <CleanState label={m.security_no_match_issues()} />
        ) : (
          <Stack gap="xl">
            {grouped.map(({ sev, items }) => (
              <Stack key={sev} gap="xs">
                <Group gap={8} align="center">
                  <SeverityDot sev={sev} />
                  <Text span fw={700} size="sm">
                    {SEV_LABEL[sev]()}
                  </Text>
                  <Text span size="xs" c="dimmed" ff="monospace">
                    {asI18n(String(items.length))}
                  </Text>
                </Group>
                <Accordion
                  variant="separated"
                  chevronPosition="right"
                  radius="md"
                >
                  {items.map((issue, idx) => {
                    const key = issueKey(issue, idx)
                    return (
                      <FindingItem
                        key={key}
                        itemValue={key}
                        issue={issue}
                        latest={latestOf.get(issue.package)}
                        renderUpgrade={renderUpgradeFor}
                      />
                    )
                  })}
                </Accordion>
              </Stack>
            ))}
          </Stack>
        )
      ) : (
        <Stack gap="sm">
          <Group justify="space-between">
            <Checkbox
              size="xs"
              disabled={selectable.length === 0}
              checked={allShownSelected}
              indeterminate={someShownSelected && !allShownSelected}
              onChange={(e) => toggleShown(e.currentTarget.checked)}
              label={m.security_select_all()}
              data-testid="security-select-all"
            />
            <Switch
              size="sm"
              checked={vulnerableOnly}
              onChange={(e) => setVulnerableOnly(e.currentTarget.checked)}
              label={m.security_vulnerable_only()}
            />
          </Group>
          {depsShown.length === 0 ? (
            <CleanState label={m.security_no_match_deps()} />
          ) : (
            <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
              {depsShown.map((d, i) => (
                <DependencyRow
                  key={d.name}
                  dep={d}
                  first={i === 0}
                  selected={selectedNames.has(d.name)}
                  onSelectedChange={(on) => toggle(d.name, on)}
                  renderUpgrade={renderUpgradeFor}
                />
              ))}
            </Paper>
          )}
          {selectedDeps.length > 1 && (
            <Paper
              withBorder
              radius="md"
              p="sm"
              data-testid="security-selection-bar"
            >
              <Group justify="space-between" wrap="wrap" gap="sm">
                <Text span size="sm">
                  {m.security_selected_count({ count: selectedDeps.length })}
                </Text>
                <Group gap="xs">
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => setSelectedNames(new Set())}
                  >
                    {m.security_clear_selection()}
                  </Button>
                  {upgrade(selectedDeps)}
                </Group>
              </Group>
            </Paper>
          )}
        </Stack>
      )}
    </Stack>
  )
}
