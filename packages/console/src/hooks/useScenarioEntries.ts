import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import type { FlowEntry } from '../components/flows/flow-types'
import type { PersonaEntry } from '../components/personas/persona-types'
import { toPersonaEntries } from '../components/personas/persona-model'
import { toEnglishName } from '../lib/strings'

export interface ScenarioFlowEntries {
  flows: FlowEntry[]
  loading: boolean
}

export interface ScenarioPersonaEntries {
  personas: PersonaEntry[]
  loading: boolean
}

/**
 * Scenario workflows as flow entries — everything the project meta marks as a
 * scenario, minus the fixtures the scenario suite uses to test itself.
 */
export function useScenarioFlowEntries(): ScenarioFlowEntries {
  const { meta, loading } = usePikkuMeta()

  const flows = useMemo((): FlowEntry[] => {
    const actors = meta.personas ?? {}
    return (Object.values(meta.workflows ?? {}) as any[])
      .filter((w) => w.source === 'scenario' || w.scenario === true)
      .filter((w) => !(w.tags ?? []).includes('test-fixture'))
      .map(
        (w): FlowEntry => ({
          name: w.name,
          displayName: toEnglishName(w.name),
          description: w.description ?? w.summary,
          stepCount: w.nodes
            ? Object.keys(w.nodes).length
            : (w.steps?.length ?? 0),
          cast: (w.actors ?? []).map((key: string) => ({
            key,
            name: (actors as any)[key]?.name,
            jobTitle: (actors as any)[key]?.jobTitle,
          })),
        })
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.workflows, meta.personas])

  return { flows, loading }
}

/**
 * Every declared person, each carrying the scopes their roles confer and
 * back-references to the scenarios that cast them.
 *
 * Named for scenarios because that is where it started; it is now the personas
 * page's source too, which is why the model itself lives beside the components
 * rather than in this hook.
 */
export function useScenarioPersonaEntries(): ScenarioPersonaEntries {
  const { meta, loading } = usePikkuMeta()

  const personas = useMemo(
    (): PersonaEntry[] =>
      toPersonaEntries({
        personas: meta.personas ?? {},
        systemRoles: meta.systemRoles ?? {},
        workflows: meta.workflows ?? {},
        features: (meta.features ?? {}) as any,
      }),
    [meta.personas, meta.systemRoles, meta.workflows, meta.features]
  )

  return { personas, loading }
}
