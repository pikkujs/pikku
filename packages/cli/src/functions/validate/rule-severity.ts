import type { ValidateFinding } from './persona-checks.js'

export type RuleLevel = 'off' | 'warn' | 'error'

/**
 * Per-rule severity from `validate.rules`, keyed by finding id: `'off'` drops
 * the finding, `'warn'` / `'error'` set its severity. Anything else (a typo, a
 * number) leaves the finding at its default rather than silencing it.
 */
export const applyRuleSeverity = (
  findings: ValidateFinding[],
  rules: Record<string, unknown> | undefined
): ValidateFinding[] => {
  if (!rules) return findings
  return findings.flatMap((f) => {
    const level = rules[f.id]
    if (level === 'off') return []
    if (level === 'warn' || level === 'error')
      return [{ ...f, severity: level }]
    return [f]
  })
}
