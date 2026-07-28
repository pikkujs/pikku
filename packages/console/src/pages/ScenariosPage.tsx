import React, { Suspense, useContext } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { ScenariosWorkspace } from '../components/scenarios/ScenariosWorkspace'
import {
  ConsoleNavigatorCtx,
  OSSConsoleNavigator,
} from '../context/ConsoleNavigatorContext'

const SCENARIOS_BASE_PATH = '/scenarios'

/**
 * A scenario has no detail view of its own: it is documented where it is
 * declared, as the prose it was written in. The workflow graph a scenario
 * compiles to is an implementation detail of running it, not how it reads.
 */
const ScenariosPageInner: React.FC = () => {
  useLocale()

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
