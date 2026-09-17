import React from 'react'
import { Center, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../../layout/PageLayout'
import { ResizablePanelLayout } from '../../layout/ResizablePanelLayout'
import { usePageOptionsDismiss } from '../../../context/PageOptionsProvider'
import { useScenarioRuns } from '../../../hooks/useScenarioRuns'
import { useSearchParams } from '../../../router'
import { scenarioViewSelection, type ScenarioView } from '../scenario-view'
import { ScenarioRunNavigator } from './ScenarioRunNavigator'
import { ScenarioRunDetail } from './ScenarioRunDetail'

export interface ScenarioRunsWorkspaceProps {
  /** Renders the features/runs switch in the header when supplied. */
  onViewChange?: (view: ScenarioView) => void
}

/**
 * The history side of the scenarios surface: every run this project kept, and
 * what one of them recorded. Reads only the run store, never the current suite.
 */
export const ScenarioRunsWorkspace: React.FC<ScenarioRunsWorkspaceProps> = ({
  onViewChange,
}) => {
  const { data: runs, isLoading } = useScenarioRuns()
  const [searchParams, setSearchParams] = useSearchParams()
  const dismiss = usePageOptionsDismiss()

  const list = runs ?? []
  // The picked run lives in the URL, so a failing run is a link you can send
  // and a host can point straight at the run a build produced. Absent, this
  // lands on the newest without writing anything.
  const selectedId = searchParams.get('run') ?? list[0]?.runId
  const selectRun = (runId?: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (runId) next.set('run', runId)
      else next.delete('run')
      return next
    })

  return (
    <ResizablePanelLayout
      header={
        <ListPageHeader
          title={m.nav_scenarios()}
          description={m.scenario_runs_page_description()}
          docsHref="https://pikku.dev/docs/wiring/workflows"
          selection={
            onViewChange
              ? scenarioViewSelection('runs', onViewChange)
              : undefined
          }
        />
      }
      leftDrawerLabel={m.pane_scenario_runs()}
      leftDrawer={
        <ScenarioRunNavigator
          runs={list}
          loading={isLoading}
          selectedId={selectedId}
          onSelect={(runId) => {
            selectRun(runId)
            dismiss()
          }}
        />
      }
      hidePanel
    >
      {selectedId ? (
        <ScenarioRunDetail
          runId={selectedId}
          onDeleted={() => selectRun(undefined)}
        />
      ) : (
        <Center p="xl">
          <Text size="sm" c="dimmed">
            {isLoading
              ? m.scenario_runs_loading()
              : m.scenario_runs_select_run()}
          </Text>
        </Center>
      )}
    </ResizablePanelLayout>
  )
}
