import type {
  ScenarioStepPhase,
  ScenarioSurface,
  ScenarioSurfaceResolution,
} from './scenario-step.types.js'

/**
 * Resolve which of a step's declared bindings run, for one step, in one run.
 *
 * The asymmetry between phases is the whole point — see
 * {@link ScenarioSurfaceResolution}.
 */
export const resolveScenarioSurfaces = (
  phase: ScenarioStepPhase,
  declared: readonly ScenarioSurface[],
  runSurface: ScenarioSurface
): ScenarioSurfaceResolution => {
  const has = (surface: ScenarioSurface) => declared.includes(surface)

  if (phase !== 'then') {
    if (has(runSurface)) {
      return { kind: 'action', surface: runSurface, fellBack: false }
    }
    return { kind: 'action', surface: 'default', fellBack: true }
  }

  const surfaces: ScenarioSurface[] = []
  if (runSurface !== 'default' && has(runSurface)) {
    surfaces.push(runSurface)
  }
  if (has('default')) {
    surfaces.push('default')
  }
  return {
    kind: 'witness',
    surfaces,
    // Only meaningful once something ran: an assertion checked server-side
    // under `--run browser` is a coverage gap, but one checked nowhere at all
    // is a step that did not happen, which the caller fails rather than counts.
    unwitnessed:
      surfaces.length > 0 && runSurface !== 'default' && !has(runSurface),
  }
}

/**
 * Structural comparison of two witnesses' observations.
 *
 * A witness that returns `undefined` asserted by throwing rather than by
 * reporting what it saw, so it is not compared — that keeps assertion-style
 * steps working without forcing every one of them to return a value.
 */
export const witnessesAgree = (a: unknown, b: unknown): boolean => {
  if (a === undefined || b === undefined) {
    return true
  }
  return stableStringify(a) === stableStringify(b)
}

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}
