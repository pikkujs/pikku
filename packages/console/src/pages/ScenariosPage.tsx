import React, { Suspense, useContext } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { WorkflowTabContent } from '../components/tabs/WorkflowTabContent'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ScenariosWorkspace } from '../components/scenarios/ScenariosWorkspace'
import {
  ConsoleNavigatorCtx,
  OSSConsoleNavigator,
  useConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const SCENARIOS_BASE_PATH = '/scenarios'

const ScenariosPageInner: React.FC = () => {
  useLocale()
  const { scenarioId } = useConsoleNavigator()

  if (scenarioId) {
    // Read-only: scenarios run only via `pikku scenario run` (actor sign-in
    // cookies can't be minted in the browser), never the workflow-start UI.
    return <WorkflowTabContent immersiveDetail readOnly entityId={scenarioId} />
  }

  return (
    <ConsoleSurface>
      <ScenariosWorkspace />
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
