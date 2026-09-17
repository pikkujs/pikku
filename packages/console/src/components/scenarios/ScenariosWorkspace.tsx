import React from 'react'
import { Box, Center, Stack, Text } from '@pikku/mantine/core'
import { asI18n } from '@pikku/react'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../layout/PageLayout'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { FeatureNavigator } from './FeatureNavigator'
import { FeatureDocument } from './FeatureDocument'
import { usePanelContext } from '../../context/PanelContext'
import type { ShellHeaderFilter } from '../ui/shellHeaderShared'
import { useScenariosBrowse } from '../../hooks/useScenariosBrowse'
import type { ScenariosBrowse } from '../../hooks/useScenariosBrowse'
import { useScenarioPersonaEntries } from '../../hooks/useScenarioEntries'
import { useDeleteScenarioRun } from '../../hooks/useScenarioRuns'
import {
  AS_WRITTEN,
  useScenarioLens,
  type ScenarioLens,
} from '../../hooks/useScenarioLens'
import { usePageOptionsDismiss } from '../../context/PageOptionsProvider'
import { ScenarioRunBand } from './runs/ScenarioRunBand'
import { runRelativeTime, runVersionLabel } from './runs/scenario-run-format'
import { ConsoleLoading } from '../ui/ConsoleLoading'

export interface ScenariosWorkspaceProps {
  /** Browse state owned by the host (see `useScenariosBrowse`). Supplying it
   *  means the host mounts the feature rail itself, so this drops its own. */
  browse?: ScenariosBrowse
  /** Run-lens state owned by the host, so its feature rail marks the same run. */
  runLens?: ScenarioLens
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
  const { personas } = useScenarioPersonaEntries()
  const { openPersona } = usePanelContext()
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
    label: m.scenarios_run_lens(),
    value: runId,
    priority: 1,
    onChange: setRunId,
    options: [
      { value: AS_WRITTEN, label: m.scenarios_run_as_written() },
      ...runList.map((summary) => ({
        value: summary.runId,
        label: asI18n(
          [
            `${summary.environment} · ${summary.surface}`,
            runRelativeTime(summary.startedAt),
            runVersionLabel(summary.version),
          ]
            .filter(Boolean)
            .join(' · ')
        ),
      })),
    ],
  })

  const showing = selected ? [selected] : features
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
        <Stack gap="lg">
          {run && lens && (
            <Box
              px={32}
              pt={24}
              pb={12}
              style={{
                maxWidth: 1120,
                position: 'sticky',
                top: 0,
                zIndex: 1,
                background: 'var(--mantine-color-body)',
              }}
            >
              <ScenarioRunBand
                run={run}
                declared={declared}
                onOpenScenario={revealScenario}
                onDelete={() =>
                  remove.mutate(run.runId, {
                    onSuccess: () => setRunId(AS_WRITTEN),
                  })
                }
                deleting={remove.isPending}
              />
            </Box>
          )}
          {showing.map((feature, index) => (
            <FeatureDocument
              key={feature.id}
              feature={feature}
              lens={lens}
              inSuite={!selected}
              topPad={!run && index === 0}
              onOpenPersona={showPersona}
            />
          ))}
        </Stack>
      )}
    </ResizablePanelLayout>
  )
}
