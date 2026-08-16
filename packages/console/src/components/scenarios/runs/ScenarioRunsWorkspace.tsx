import React, { useEffect, useState } from 'react'
import { Center, Text } from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { ListPageHeader } from '../../layout/PageLayout'
import { ResizablePanelLayout } from '../../layout/ResizablePanelLayout'
import { usePageOptionsDismiss } from '../../../context/PageOptionsProvider'
import { useScenarioRuns } from '../../../hooks/useScenarioRuns'
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
  const [selectedId, setSelectedId] = useState<string>()
  const dismiss = usePageOptionsDismiss()

  const list = runs ?? []
  // Landing on the newest run is what someone opening this screen came for;
  // once they have picked one it stays picked, even as newer runs arrive.
  useEffect(() => {
    if (!selectedId && list.length > 0) setSelectedId(list[0]!.runId)
  }, [selectedId, list])

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
            setSelectedId(runId)
            dismiss()
          }}
        />
      }
      hidePanel
    >
      {selectedId ? (
        <ScenarioRunDetail
          runId={selectedId}
          onDeleted={() => setSelectedId(undefined)}
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
