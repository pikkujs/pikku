import { useMemo, useState } from 'react'
import type {
  ScenarioRunRecord,
  ScenarioRunSummary,
} from '@pikku/core/scenario'
import { useScenarioRun, useScenarioRuns } from './useScenarioRuns'
import {
  buildScenarioRunLens,
  type ScenarioRunLens,
} from '../components/scenarios/scenario-run-lens'

/** The option that reads the suite as written, claiming nothing about runs. */
export const AS_WRITTEN = 'declared'

export interface ScenarioLens {
  runs: ScenarioRunSummary[]
  /** The run being read, or `AS_WRITTEN`. */
  runId: string
  setRunId: (runId: string) => void
  run: ScenarioRunRecord | null | undefined
  /** Undefined while reading the suite as written. */
  lens: ScenarioRunLens | undefined
}

export interface ScenarioLensControl {
  /** Undefined means nobody has picked one, so the newest run is read. */
  runId?: string
  setRunId: (runId: string) => void
}

/**
 * Which run the scenarios screen is being read through.
 *
 * Hoisted for the same reason `useScenariosBrowse` is: a host that mounts the
 * feature rail itself needs the rail's result bars and the document's markers
 * to be the same run. Mounting it twice costs no extra request — the run
 * queries are keyed, so the second caller reads the first one's cache.
 *
 * `control` puts the choice somewhere shareable, usually the URL. Nothing is
 * written there until someone picks a run, so the screen opens on the newest
 * one without rewriting the address it was opened with.
 */
export const useScenarioLens = (
  control?: ScenarioLensControl
): ScenarioLens => {
  const [ownRunId, setOwnRunId] = useState<string>()
  const { data: runs } = useScenarioRuns()
  const list = runs ?? []

  const picked = control ? control.runId : ownRunId
  const setRunId = control ? control.setRunId : setOwnRunId
  const reading =
    picked === AS_WRITTEN ? null : (picked ?? list[0]?.runId ?? null)

  const { data: run } = useScenarioRun(reading)
  const lens = useMemo(
    () => (run && reading ? buildScenarioRunLens(run) : undefined),
    [run, reading]
  )

  return { runs: list, runId: reading ?? AS_WRITTEN, setRunId, run, lens }
}
