import React, { useState } from 'react'
import { Center, Stack, Text } from '@pikku/mantine/core'
import { asI18n, type I18nString } from '@pikku/react'
import { CircleSlash, PencilOff } from 'lucide-react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { FeatureNavigator } from './FeatureNavigator'
import { ScenarioFeatureCard } from './ScenarioFeatureCard'
import { WorkflowProvider } from '../../context/WorkflowContext'
import { usePanelContext } from '../../context/PanelContext'
import type { ShellHeaderFilter } from '../ui/shellHeaderShared'
import { useScenariosBrowse } from '../../hooks/useScenariosBrowse'
import type { ScenariosBrowse } from '../../hooks/useScenariosBrowse'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { useDeleteScenarioRun } from '../../hooks/useScenarioRuns'
import { useScenarioCoverage } from '../../hooks/useScenarioCoverage'
import {
  AS_WRITTEN,
  useScenarioLens,
  type ScenarioLens,
} from '../../hooks/useScenarioLens'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import { ScenarioRunVerdict } from './runs/ScenarioRunVerdict'
import { runAgo } from './runs/scenario-run-format'
import { useLocale } from '@/i18n/config'
import { CardsPage } from '../ui/CardsPage'
import { SectionCard } from '../ui/SectionCard'
import { CardRow } from '../ui/CardRow'
import { StatusTile } from '../ui/StatusTile'
import type { ScenarioRunSummary } from '@pikku/core/scenario'
import { ConsoleLoading } from '../ui/ConsoleLoading'

export interface ScenariosWorkspaceProps {
  /** Browse state owned by the host (see `useScenariosBrowse`). Supplying it
   *  means the host mounts the feature rail itself, so this drops its own. */
  browse?: ScenariosBrowse
  /** Run-lens state owned by the host, so its feature rail marks the same run. */
  runLens?: ScenarioLens
}

const runOptionLabel = (
  summary: ScenarioRunSummary,
  locale: string
): I18nString => {
  const when = runAgo(summary.startedAt, locale)
  if (summary.status === 'running')
    return m.scenarios_run_option_running({ when })
  if (summary.failed > 0)
    return m.scenarios_run_option_failed({ when, count: summary.failed })
  return m.scenarios_run_option_passed({ when, count: summary.passed })
}

const revealScenario = (name: string) => {
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-testid="scenario-section-${name}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}

/**
 * The scenarios screen: the suite as the document, and a run as a lens over it.
 *
 * One surface rather than two, because the specification and its last result
 * are the same subject — a reader asking "what does this feature promise" and
 * one asking "did it hold" are looking at the same paragraph. Picking a run
 * marks the scenarios it reached, opens what it failed on, and leaves the ones
 * it never got to visibly untouched; picking none reads the suite as written.
 */
export const ScenariosWorkspace: React.FC<ScenariosWorkspaceProps> = ({
  browse: hostBrowse,
  runLens: hostLens,
}) => {
  const { locale } = useLocale()
  const { personas } = useScenarioPersonaEntries()
  const [stepWorkflow, setStepWorkflow] = useState<unknown>()
  const { openWorkflowStep, openPersona } = usePanelContext()
  const dismiss = usePageOptionsDismiss()

  // Always mounted so the hook order never depends on the prop; the host's
  // state wins when there is one, and the two share one query cache.
  const ownBrowse = useScenariosBrowse()
  const browse = hostBrowse ?? ownBrowse
  const {
    features,
    tags,
    selectedTags,
    setSelectedTags,
    searchQuery,
    setSearchQuery,
    selectedId,
    setSelectedId,
    selected,
    loading,
  } = browse

  const ownLens = useScenarioLens()
  const { runs: runList, runId, setRunId, run, lens } = hostLens ?? ownLens
  const remove = useDeleteScenarioRun()

  const headerFilters: ShellHeaderFilter[] = []
  if (tags.length > 0) {
    headerFilters.push({
      key: 'tags',
      testId: 'scenario-tag-filter',
      label: m.scenarios_tags_lens(),
      value: '',
      multiple: true,
      values: selectedTags,
      emptyLabel: m.scenarios_all_tags(),
      onChange: (tag) =>
        setSelectedTags(
          selectedTags.includes(tag)
            ? selectedTags.filter((entry) => entry !== tag)
            : [...selectedTags, tag]
        ),
      options: tags.map((tag) => ({ value: tag, label: asI18n(tag) })),
    })
  }
  headerFilters.push({
    key: 'run',
    testId: 'scenario-run-filter',
    label: m.scenarios_run_lens(),
    value: runId,
    priority: 1,
    onChange: setRunId,
    options: [
      { value: AS_WRITTEN, label: m.scenarios_run_as_written() },
      ...runList.map((summary) => ({
        value: summary.runId,
        label: runOptionLabel(summary, locale),
      })),
    ],
  })

  const showing = selected ? [selected] : features
  const coverage = useScenarioCoverage().data
  const declared = features.reduce(
    (sum, feature) => sum + feature.scenarios.length,
    0
  )

  /**
   * A persona opens in the panel, beside the feature that cast them. Following
   * one of their scenarios reads it where it is declared, so the document
   * switches to the owning feature rather than navigating anywhere.
   */
  const showPersona = (key: string) => {
    const persona = personas.find((entry) => entry.key === key)
    if (!persona) return
    openPersona(key, persona.name, {
      persona,
      onOpenScenario: (name: string) => {
        const owner = features.find((feature) =>
          feature.scenarios.some((entry) => entry.scenario.name === name)
        )
        if (owner) setSelectedId(owner.id)
        revealScenario(name)
      },
    })
  }

  return (
    /* the provider sits above the panel so a step's details can read its own
       scenario's workflow meta, not just the document's — a host that mounts
       the panel outside this tree reads the same meta off the panel data */
    <WorkflowProvider workflow={stepWorkflow}>
      <ResizablePanelLayout
        header={
          <ListPageHeader
            title={m.nav_scenarios()}
            description={m.scenarios_page_description()}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            search={{
              placeholder: m.scenarios_search_placeholder(),
              value: searchQuery,
              onChange: setSearchQuery,
            }}
            headerFilters={headerFilters}
          />
        }
        leftDrawerLabel={m.pane_features()}
        leftDrawer={
          loading || hostBrowse ? null : (
            <FeatureNavigator
              features={features}
              selectedId={selectedId}
              lens={lens}
              onSelect={(id) => {
                setSelectedId(id)
                dismiss()
              }}
            />
          )
        }
        emptyPanelMessage={m.scenarios_select_step()}
        hidePanel={loading}
        surface="cards"
      >
        {loading ? (
          <ConsoleLoading />
        ) : features.length === 0 ? (
          <Center p="xl">
            <Text size="sm" c="dimmed">
              {m.scenarios_no_features()}
            </Text>
          </Center>
        ) : (
          <CardsPage>
            {run && lens && (
              <ScenarioRunVerdict
                run={run}
                declared={declared}
                onOpenScenario={revealScenario}
                onShowFailed={() => {
                  const first = run.results.find(
                    (result) => result.status === 'failed'
                  )
                  if (first) revealScenario(first.scenarioName ?? first.name)
                }}
                onDelete={() =>
                  remove.mutate(run.runId, {
                    onSuccess: () => setRunId(AS_WRITTEN),
                  })
                }
                deleting={remove.isPending}
              />
            )}
            {showing.map((feature) => (
              <ScenarioFeatureCard
                key={feature.id}
                feature={feature}
                lens={lens}
                expanded={Boolean(selected) && !run}
                onOpenPersona={showPersona}
                onSelectStep={(workflow, stepId, stepType, metadata) => {
                  setStepWorkflow(workflow)
                  openWorkflowStep(stepId, stepType, {
                    ...metadata,
                    stepType,
                    workflow,
                  })
                }}
              />
            ))}
            {run && run.skipped.length > 0 && (
              <SectionCard
                title={m.scenarios_skipped_title()}
                blurb={m.scenarios_skipped_blurb()}
                testId="scenario-run-skipped"
              >
                <Stack gap="xs" mt="md">
                  {run.skipped.map((skip) => (
                    <CardRow
                      key={skip.name}
                      leading={
                        <StatusTile tone="neutral">
                          <CircleSlash size={18} />
                        </StatusTile>
                      }
                      title={asI18n(skip.name)}
                      meta={asI18n(skip.reason)}
                    />
                  ))}
                </Stack>
              </SectionCard>
            )}
            {!run && !selected && coverage?.mutations.uncovered.length ? (
              <SectionCard
                title={m.scenarios_untested_title()}
                subtitle={
                  coverage.api
                    ? m.scenarios_untested_lines({
                        covered: coverage.api.covered,
                        total: coverage.api.total,
                      })
                    : undefined
                }
                blurb={m.scenarios_untested_blurb()}
                testId="scenario-coverage-untested"
              >
                <Stack gap="xs" mt="md">
                  {coverage.mutations.uncovered.map((mutation) => (
                    <CardRow
                      key={mutation.id}
                      leading={
                        <StatusTile tone="warn">
                          <PencilOff size={18} />
                        </StatusTile>
                      }
                      title={asI18n(mutation.id)}
                      meta={
                        mutation.sourceFile
                          ? asI18n(mutation.sourceFile)
                          : undefined
                      }
                    />
                  ))}
                </Stack>
              </SectionCard>
            ) : null}
          </CardsPage>
        )}
      </ResizablePanelLayout>
    </WorkflowProvider>
  )
}
