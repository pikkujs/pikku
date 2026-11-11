import type { ScenarioStepPhase } from './scenario-step.types.js'

/**
 * Fills a step template's `{key}` placeholders from its input, collapsing whitespace. Missing values render as empty.
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

/**
 * Renders one scenario step as a Gherkin-style sentence — keyword, virtual user, then the step text.
 */
export const composeStepProse = ({
  phase,
  description,
  template,
  input,
  virtualUser,
  virtualUserRole,
  continuesPhase,
  continuesVirtualUser,
  keywordWidth,
}: {
  phase: ScenarioStepPhase
  description: string
  template?: string
  input?: unknown
  virtualUser?: string
  /**
   * What this virtual user is, rendered as an apposition after their key — "yasser
   * (the founder)". Only pass it where the virtual user has not been named yet: an
   * ordinary run repeats one virtual user for a dozen steps, and repeating the role
   * with them turns the one piece of context into the noise around it.
   */
  virtualUserRole?: string
  /**
   * This step repeats the phase of the one before it, so it reads as `And`
   * rather than saying `Given` three times — the same thing Gherkin does.
   */
  continuesPhase?: boolean
  /**
   * The step before this one had the same virtual user. Combined with `continuesPhase`
   * the subject is dropped, because English drops a repeated subject in a
   * compound predicate: "yasser opens the dashboard / and sees the audit log".
   *
   * It takes both. Dropping the subject across a phase change gives "When opens
   * the dashboard", and a pronoun instead of a name would give "they sees",
   * since step templates are authored in the third person singular.
   */
  continuesVirtualUser?: boolean
  keywordWidth?: number
}): string => {
  const keyword = capitalise(continuesPhase ? 'and' : phase)
  // The virtual user key is the subject verbatim, with no article in front of it.
  // "the ${virtual user}" only reads as English when the key happens to be a role
  // noun — it turns a virtual user named after a person into "the nadia", which
  // is the reporter quietly imposing a naming convention on the author.
  const subject =
    continuesPhase && continuesVirtualUser
      ? ''
      : composeSubject(virtualUser, virtualUserRole)
  const rendered = template ? renderStepTemplate(template, input) : description
  const sentence = [subject, rendered].filter(Boolean).join(' ')
  if (keywordWidth === undefined) {
    return [keyword, sentence].filter(Boolean).join(' ')
  }
  return `${keyword.padEnd(keywordWidth)} ${sentence}`
}

const composeSubject = (
  virtualUser?: string,
  virtualUserRole?: string
): string => {
  if (!virtualUser) return ''
  return virtualUserRole
    ? `${virtualUser} (the ${virtualUserRole})`
    : virtualUser
}

const capitalise = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)
