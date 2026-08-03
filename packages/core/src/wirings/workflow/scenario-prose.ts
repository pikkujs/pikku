import type { ScenarioStepPhase } from './scenario-step.types.js'

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
  template?: string
  input?: unknown
  actor?: string
  keywordWidth?: number
}): string => {
  const keyword = capitalise(phase)
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
