import type { ScenarioStepPhase } from './scenario-step.types.js'

/**
 * Renders the English sentence a reporter shows for a scenario step.
 *
 * This is the inversion of cucumber: rather than parsing English into a call,
 * we render English out of a typed call, so the readable report survives
 * without a regex registry paying for it.
 *
 * Lives in core so the CLI reporter and the console render identically.
 */
/**
 * Fill a step's `template` from the input that step was actually called with,
 * so the reported sentence names the values under test — "sees @pikku/addon-todos"
 * rather than "sees an addon in the gallery" repeated three times.
 *
 * A placeholder with no recorded value renders as nothing and the surrounding
 * whitespace collapses, so an optional input that was omitted reads as a shorter
 * sentence rather than a literal `{state}` leaking into the report.
 */
export const renderStepTemplate = (
  template: string,
  input: unknown
): string => {
  const values =
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  return template
    .replace(/\{(\w+)\}/g, (_match, key: string) => formatValue(values[key]))
    .replace(/\s+/g, ' ')
    .trim()
}

const formatValue = (value: unknown): string => {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export const composeStepProse = ({
  phase,
  description,
  template,
  input,
  actor,
  keywordWidth,
}: {
  phase: ScenarioStepPhase
  description: string
  /**
   * The prose this step renders, with `{placeholders}` filled from `input`.
   * Unlike `description`, which documents what the step does, this is what a
   * reader of the report sees. Falls back to `description` when absent.
   */
  template?: string
  /** The input this step was called with, as recorded on the run. */
  input?: unknown
  actor?: string
  /**
   * Pad the keyword to this width so a ladder of steps lines its sentences up
   * under each other. Omit for inline prose.
   */
  keywordWidth?: number
}): string => {
  const keyword = phase === 'step' ? '' : capitalise(phase)
  const subject = actor ? `the ${actor}` : ''
  const rendered = template ? renderStepTemplate(template, input) : description
  const sentence = [subject, rendered].filter(Boolean).join(' ')
  if (keywordWidth === undefined) {
    return [keyword, sentence].filter(Boolean).join(' ')
  }
  return `${keyword.padEnd(keywordWidth)} ${sentence}`
}

const capitalise = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)
