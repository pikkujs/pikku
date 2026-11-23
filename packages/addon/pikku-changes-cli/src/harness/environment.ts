import { formatFinding } from './feedback.js'
import { HarnessInfraError, type Finding } from './finding.js'

/**
 * The diagnostic codes of a checkout whose dependencies are missing or broken: an addon that cannot be resolved
 * (`PKU340`), a module that cannot be found (`TS2307`, only for a package or workspace name, never a relative path),
 * a type-definition file that cannot be found (`TS2688`), and codegen failing (`CODEGEN`), which counts only when
 * every other finding is one of these. A missing export (`TS2305`, `TS2724`) is code.
 */
export const ENVIRONMENT_CODES = [
  'PKU340',
  'TS2307',
  'TS2688',
  'CODEGEN',
] as const

/** How many environment findings an environment error lists. */
const LISTED = 5

/** The code of a finding's rule, without the tool's prefix (`pikku/TS2307` is `TS2307`). */
const codeOf = (finding: Finding) => finding.rule?.split('/').at(-1) ?? ''

/** A bare specifier that names a package or a workspace package (`@scope/name/sub`, `name/sub`). */
const PACKAGE = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/.*)?$/i

const missingModule = (message: string) =>
  message.match(/Cannot find module '([^']+)'/)?.[1]

const isUnresolved = (finding: Finding): boolean => {
  switch (codeOf(finding)) {
    case 'PKU340':
    case 'TS2688':
      return true
    case 'TS2307': {
      const name = missingModule(finding.message)
      return !!name && PACKAGE.test(name)
    }
    default:
      return false
  }
}

/**
 * Splits findings into environment findings and code findings. `CODEGEN` is an environment finding only when
 * there is another environment finding and no code finding; next to a code finding it stays code.
 */
export const splitEnvironment = (
  findings: Finding[]
): { environment: Finding[]; code: Finding[] } => {
  const unresolved = findings.filter(isUnresolved)
  const rest = findings.filter((f) => !isUnresolved(f))
  const onlyCodegen = rest.every((f) => codeOf(f) === 'CODEGEN')
  return unresolved.length && onlyCodegen
    ? { environment: findings, code: [] }
    : { environment: unresolved, code: rest }
}

/** Every finding is an environment finding (and there is one): no code change fixes it. */
export const environmentOnly = (findings: Finding[]): boolean =>
  findings.length > 0 && splitEnvironment(findings).code.length === 0

/** The first few findings as list items, redacted, with a count of the rest. */
export const listFindings = (findings: Finding[], max = LISTED): string => {
  const shown = findings.slice(0, max).map(formatFinding)
  if (findings.length > max) shown.push(`… and ${findings.length - max} more`)
  return shown.join('\n')
}

/**
 * The infra error of a check whose findings are all environment findings: dependencies are missing or broken in
 * `where` (the main checkout, a worktree), which an agent turn cannot fix.
 */
export const environmentError = (
  findings: Finding[],
  where: string
): HarnessInfraError =>
  new HarnessInfraError(
    'environment',
    `Dependencies are missing or broken in ${where}: every finding of its check is a module, addon or type definition that cannot be resolved, which no code change fixes. Install them (the setup command) and start again. Its check found ${findings.length}:\n${listFindings(findings)}`
  )
