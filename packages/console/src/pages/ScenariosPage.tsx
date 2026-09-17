import React, { Suspense, useContext } from 'react'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ScenariosWorkspace } from '../components/scenarios/ScenariosWorkspace'
import type { ScenariosBrowse } from '../hooks/useScenariosBrowse'
import { useScenarioLens, type ScenarioLens } from '../hooks/useScenarioLens'
import { useSearchParams } from '../router'
import {
  ConsoleNavigatorCtx,
  OSSConsoleNavigator,
} from '../context/ConsoleNavigatorContext'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'

const SCENARIOS_BASE_PATH = '/scenarios'

/**
 * A scenario has no detail view of its own: it is documented where it is
 * declared, as the prose it was written in. The workflow graph a scenario
 * compiles to is an implementation detail of running it, not how it reads.
 *
 * Past runs are the same subject read the other way round, so a run is a lens
 * over this page rather than a page of its own — and which run lives in the URL
 * so a failing run is something you can send someone.
 */
const ScenariosPageInner: React.FC<ScenariosPageProps> = ({
  browse,
  runLens,
}) => {
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const ownLens = useScenarioLens({
    runId: searchParams.get('run') ?? undefined,
    setRunId: (run) => setSearchParams({ run }),
  })

  return (
    <ConsoleSurface>
      <ScenariosWorkspace browse={browse} runLens={runLens ?? ownLens} />
    </ConsoleSurface>
  )
}

export interface ScenariosPageProps {
  /** Forwarded to `ScenariosWorkspace` — see its `browse` prop. */
  browse?: ScenariosBrowse
  /** Forwarded to `ScenariosWorkspace` — see its `runLens` prop. */
  runLens?: ScenarioLens
}

export const ScenariosPage: React.FC<ScenariosPageProps> = ({
  browse,
  runLens,
}) => {
  // Host apps (e.g. the Fabric console) provide their own navigator; only
  // fall back to the OSS query-param navigator when none is present.
  const hostNavigator = useContext(ConsoleNavigatorCtx)
  const page = (
    <Suspense fallback={<ConsoleLoading h="100vh" />}>
      <ScenariosPageInner browse={browse} runLens={runLens} />
    </Suspense>
  )
  if (hostNavigator) return page
  return (
    <OSSConsoleNavigator basePath={SCENARIOS_BASE_PATH}>
      {page}
    </OSSConsoleNavigator>
  )
}
