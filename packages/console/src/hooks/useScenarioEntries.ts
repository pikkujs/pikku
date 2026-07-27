import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import type { FlowEntry } from '../components/flows/flow-types'
import type {
  PersonaEntry,
  PersonaScenarioRef,
} from '../components/personas/persona-types'
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
    const actors = meta.scenarioActors ?? {}
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
  }, [meta.workflows, meta.scenarioActors])

  return { flows, loading }
}

/**
 * The personas scenarios sign in as, each carrying back-references to the
 * scenarios that cast them and the features those scenarios belong to.
 */
export function useScenarioPersonaEntries(): ScenarioPersonaEntries {
  const { meta, loading } = usePikkuMeta()

  const personas = useMemo((): PersonaEntry[] => {
    const actors = meta.scenarioActors ?? {}

    const featureByScenario = new Map<string, string>()
    for (const feature of Object.values(meta.features ?? {}) as any[]) {
      for (const entry of feature.entries ?? []) {
        featureByScenario.set(entry.scenario, feature.name)
      }
    }

    const scenariosByActor = new Map<string, PersonaScenarioRef[]>()
    const featuresByActor = new Map<string, Set<string>>()
    for (const w of Object.values(meta.workflows ?? {}) as any[]) {
      if (!(w.source === 'scenario' || w.scenario === true)) continue
      if ((w.tags ?? []).includes('test-fixture')) continue
      const feature = featureByScenario.get(w.name)
      for (const actor of w.actors ?? []) {
        const list = scenariosByActor.get(actor) ?? []
        list.push({
          name: w.name,
          displayName: w.title ?? toEnglishName(w.name),
        })
        scenariosByActor.set(actor, list)
        if (feature) {
          const features = featuresByActor.get(actor) ?? new Set<string>()
          features.add(feature)
          featuresByActor.set(actor, features)
        }
      }
    }

    return Object.entries(actors)
      .map(
        ([key, cfg]: [string, any]): PersonaEntry => ({
          key,
          name: cfg.name ?? key,
          email: cfg.email,
          jobTitle: cfg.jobTitle,
          personality: cfg.personality,
          scenarios: scenariosByActor.get(key) ?? [],
          features: [...(featuresByActor.get(key) ?? [])].sort(),
        })
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [meta.scenarioActors, meta.workflows, meta.features])

  return { personas, loading }
}
