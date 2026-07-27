import React, { Suspense, useContext, useState } from 'react'
import {
  Group,
  TextInput,
  Center,
  Loader,
  SegmentedControl,
} from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import { asI18n } from '@pikku/react'
import { useLocale } from '@/i18n/config'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { ScenarioFlowsPanel } from '../components/flows/ScenarioFlowsPanel'
import { ScenarioPersonasPanel } from '../components/personas/ScenarioPersonasPanel'
import {
  ConsoleNavigatorCtx,
  OSSConsoleNavigator,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const SCENARIOS_BASE_PATH = '/scenarios'

const ScenariosPageInner: React.FC = () => {
  useLocale()
  const { scenarioId, navigateTo } = useConsoleNavigator()
  const [view, setView] = useState<'scenarios' | 'personas'>('scenarios')
  const [searchQuery, setSearchQuery] = useState('')

  if (scenarioId) {
    // Read-only: scenarios run only via `pikku scenario run` (actor sign-in
    // cookies can't be minted in the browser), never the workflow-start UI.
    return <WorkflowTabContent immersiveDetail readOnly entityId={scenarioId} />
  }

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        hidePanel
        header={
          <ListPageHeader
            title={asI18n('Scenarios')}
            description={asI18n(
              'End-to-end scenario tests and the personas that run them'
            )}
            docsHref="https://pikku.dev/docs/wiring/workflows"
            filters={
              <Group gap="sm" wrap="nowrap">
                <SegmentedControl
                  size="xs"
                  value={view}
                  onChange={(value) => setView(value as typeof view)}
                  data={[
                    { label: asI18n('Flows'), value: 'scenarios' },
                    { label: asI18n('Personas'), value: 'personas' },
                  ]}
                />
                <TextInput
                  placeholder={
                    view === 'personas'
                      ? asI18n('Search personas…')
                      : asI18n('Search flows…')
                  }
                  leftSection={<Search size={14} />}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  size="xs"
                  style={{ width: 240 }}
                />
              </Group>
            }
          />
        }
      >
        {view === 'personas' ? (
          <ScenarioPersonasPanel
            searchQuery={searchQuery}
            onOpenFlow={(name) => navigateTo('scenarios', name)}
          />
        ) : (
          <ScenarioFlowsPanel
            searchQuery={searchQuery}
            onOpen={(name) => navigateTo('scenarios', name)}
          />
        )}
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}

export const ScenariosPage: React.FC = () => {
  // Host apps (e.g. the Fabric console) provide their own navigator; only
  // fall back to the OSS query-param navigator when none is present.
  const hostNavigator = useContext(ConsoleNavigatorCtx)
  const page = (
    <Suspense
      fallback={
        <Center h="100vh">
          <Loader />
        </Center>
      }
    >
      <ScenariosPageInner />
    </Suspense>
  )
  if (hostNavigator) return page
  return (
    <OSSConsoleNavigator basePath={SCENARIOS_BASE_PATH}>
      {page}
    </OSSConsoleNavigator>
  )
}
