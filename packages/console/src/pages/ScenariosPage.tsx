import React, { Suspense, useContext } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ScenariosWorkspace } from '../components/scenarios/ScenariosWorkspace'
import { ScenarioRunsWorkspace } from '../components/scenarios/runs/ScenarioRunsWorkspace'
import type { ScenarioView } from '../components/scenarios/scenario-view'
import type { ScenariosBrowse } from '../hooks/useScenariosBrowse'
import { useSearchParams } from '../router'
import {
  ConsoleNavigatorCtx,
  OSSConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const SCENARIOS_BASE_PATH = '/scenarios'

/**
 * A scenario has no detail view of its own: it is documented where it is
 * declared, as the prose it was written in. The workflow graph a scenario
 * compiles to is an implementation detail of running it, not how it reads.
 *
 * Past runs are the same subject read the other way round, so they are a view
 * of this page rather than a page of their own — and the view lives in the URL
 * so a failing run is something you can send someone.
 */
const ScenariosPageInner: React.FC<ScenariosPageProps> = ({ browse }) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const view: ScenarioView =
    searchParams.get('view') === 'runs' ? 'runs' : 'features'
  const changeView = (next: ScenarioView) =>
    setSearchParams(next === 'runs' ? { view: 'runs' } : {})

  return (
    <ConsoleSurface>
      {view === 'runs' ? (
        <ScenarioRunsWorkspace onViewChange={changeView} />
      ) : (
        <ScenariosWorkspace browse={browse} onViewChange={changeView} />
      )}
    </ConsoleSurface>
  )
}

export interface ScenariosPageProps {
  /** Forwarded to `ScenariosWorkspace` — see its `browse` prop. */
  browse?: ScenariosBrowse
}

export const ScenariosPage: React.FC<ScenariosPageProps> = ({ browse }) => {
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
      <ScenariosPageInner browse={browse} />
    </Suspense>
  )
  if (hostNavigator) return page
  return (
    <OSSConsoleNavigator basePath={SCENARIOS_BASE_PATH}>
      {page}
    </OSSConsoleNavigator>
  )
}
