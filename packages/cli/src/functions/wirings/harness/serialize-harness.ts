import type { FunctionsMeta } from '@pikku/core/services'
import type { InspectorState } from '@pikku/inspector'
import { isHarnessFunction } from '../scenarios/scenario-partition.js'

/**
 * What a harness engine reads: every harness, gate agent and gate. Gates are
 * functions, so their entry is their function meta, with `failOn`, `writes`,
 * `workflowRetries` and `workflowTimeout`.
 */
export const serializeHarnessMeta = (
  state: Pick<InspectorState, 'functions' | 'harness'>
): string => {
  const gatesMeta: FunctionsMeta = Object.fromEntries(
    Object.entries(state.functions.meta).filter(([, meta]) =>
      isHarnessFunction(meta)
    )
  )
  return JSON.stringify(
    {
      harnessesMeta: state.harness?.harnessesMeta ?? {},
      gateAgentsMeta: state.harness?.gateAgentsMeta ?? {},
      gatesMeta,
    },
    null,
    2
  )
}

/**
 * The names a harness may list: every gate and gate agent. `never` when there
 * are none, so `pikkuHarness<HarnessGateName>` refuses any name at all.
 */
export const serializeHarnessGateNames = (
  state: Pick<InspectorState, 'functions' | 'harness'>
): string => {
  const names = [
    ...Object.entries(state.functions.meta)
      .filter(([, meta]) => isHarnessFunction(meta))
      .map(([name]) => name),
    ...Object.keys(state.harness?.gateAgentsMeta ?? {}),
  ].sort()
  return `/**
 * The harness gates and gate agents declared in this project.
 */

export type HarnessGateName = ${
    names.length === 0
      ? 'never'
      : names.map((name) => JSON.stringify(name)).join(' | ')
  }
`
}
