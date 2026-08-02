import * as ts from 'typescript'
import { DISPOSITIONS } from '@pikku/core/virtual-user'
import { extractFunctionName } from '../utils/extract-function-name.js'
import { ErrorCode } from '../error-codes.js'
import type { AddWiring, InspectorVirtualUser } from '../types.js'

const getProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): ts.Expression | undefined => {
  const property = config.properties.find(
    (p) =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === name
  )
  return property && ts.isPropertyAssignment(property)
    ? property.initializer
    : undefined
}

const stringProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): string | undefined => {
  const value = getProperty(config, name)
  return value && ts.isStringLiteralLike(value) ? value.text : undefined
}

const numberProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): number | undefined => {
  const value = getProperty(config, name)
  if (!value) {
    return undefined
  }
  // `-1` parses as a unary minus over a literal, not as a literal. Reading it
  // rather than ignoring it is what lets a negative be *rejected* below instead
  // of silently dropped and defaulted.
  if (
    ts.isPrefixUnaryExpression(value) &&
    value.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(value.operand)
  ) {
    return -Number(value.operand.text)
  }
  return ts.isNumericLiteral(value) ? Number(value.text) : undefined
}

const booleanProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): boolean | undefined => {
  const value = getProperty(config, name)
  if (!value) {
    return undefined
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) {
    return true
  }
  if (value.kind === ts.SyntaxKind.FalseKeyword) {
    return false
  }
  return undefined
}

const stringArrayProperty = (
  config: ts.ObjectLiteralExpression,
  name: string
): string[] | undefined => {
  const value = getProperty(config, name)
  if (!value || !ts.isArrayLiteralExpression(value)) {
    return undefined
  }
  const values = value.elements
    .filter(ts.isStringLiteralLike)
    .map((e) => e.text)
  return values.length === value.elements.length ? values : undefined
}

type Tuning = NonNullable<InspectorVirtualUser['tuning']>

/** A dial and the range outside which it is a mistake rather than a choice. */
const RATES: [keyof Tuning, number, number][] = [
  ['temperature', 0, 2],
  ['repeatRate', 0, 1],
  ['reReadRate', 0, 1],
]

/**
 * `{ moves, temperature, repeatRate, … }` — a disposition's dials, overridden.
 *
 * The ranges are checked here rather than at run time because these are the
 * kind of typo that does not throw: `repeatRate: 18` meaning 18% would silently
 * double every call the user makes, and you would read the run as a product bug.
 */
const tuningProperty = (
  config: ts.ObjectLiteralExpression,
  onError: (message: string) => void
): InspectorVirtualUser['tuning'] => {
  const value = getProperty(config, 'tuning')
  if (!value || !ts.isObjectLiteralExpression(value)) {
    return undefined
  }

  const tuning: Tuning = {}

  const movesValue = getProperty(value, 'moves')
  if (movesValue && ts.isObjectLiteralExpression(movesValue)) {
    const moves: NonNullable<Tuning['moves']> = {}
    for (const move of ['continue', 'suspend', 'resume', 'abandon'] as const) {
      const weight = numberProperty(movesValue, move)
      if (weight === undefined) {
        continue
      }
      if (weight < 0) {
        onError(`tuning.moves.${move} must not be negative (got ${weight}).`)
        continue
      }
      moves[move] = weight
    }
    if (Object.keys(moves).length) {
      tuning.moves = moves
    }
  }

  for (const [name, min, max] of RATES) {
    const rate = numberProperty(value, name)
    if (rate === undefined) {
      continue
    }
    if (rate < min || rate > max) {
      onError(`tuning.${name} must be between ${min} and ${max} (got ${rate}).`)
      continue
    }
    Object.assign(tuning, { [name]: rate })
  }

  for (const flag of ['emptyMemory', 'readOnly', 'invertedOracle'] as const) {
    const declared = booleanProperty(value, flag)
    if (declared !== undefined) {
      tuning[flag] = declared
    }
  }

  const instructions = stringProperty(value, 'instructions')
  if (instructions !== undefined) {
    tuning.instructions = instructions
  }

  return Object.keys(tuning).length ? tuning : undefined
}

/** `{ steps, mutations, duration }` — caps the engine can count for itself. */
const budgetProperty = (
  config: ts.ObjectLiteralExpression
): InspectorVirtualUser['budget'] => {
  const value = getProperty(config, 'budget')
  if (!value || !ts.isObjectLiteralExpression(value)) {
    return undefined
  }
  const steps = numberProperty(value, 'steps')
  const mutations = numberProperty(value, 'mutations')
  const duration =
    stringProperty(value, 'duration') ?? numberProperty(value, 'duration')
  const budget = {
    ...(steps !== undefined ? { steps } : {}),
    ...(mutations !== undefined ? { mutations } : {}),
    ...(duration !== undefined ? { duration } : {}),
  }
  return Object.keys(budget).length ? budget : undefined
}

/**
 * Inspector for `pikkuVirtualUser()` calls.
 *
 * A virtual user is entirely declaration — an actor to sign in as, a
 * disposition, and what it is trying to get done. There is no code body, so
 * unlike a feature there is nothing to resolve at runtime and nothing to
 * register: what is read here is the whole thing, and it is generated straight
 * to `scenarios/virtual-users.gen.json` for the CLI and the console to read.
 *
 * `actor` is the one field that cannot be inferred or defaulted. Without it
 * there is no identity to sign in as, so a non-literal or missing actor is a
 * coded error rather than a silently half-declared user.
 */
export const addVirtualUser: AddWiring = (logger, node, checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'pikkuVirtualUser') {
    return
  }

  const { exportedName } = extractFunctionName(node, checker, state.rootDir)

  if (!exportedName) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `A pikkuVirtualUser() must be assigned to an export — the export identifier is the virtual user's id.`
    )
    return
  }

  const [config] = node.arguments
  if (!config || !ts.isObjectLiteralExpression(config)) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `pikkuVirtualUser('${exportedName}') needs an inline config object — a virtual user is read statically, never evaluated.`
    )
    return
  }

  const actor = stringProperty(config, 'actor')
  if (!actor) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `pikkuVirtualUser('${exportedName}') needs a literal 'actor' — that is the identity it signs in as.`
    )
    return
  }

  const virtualUser: InspectorVirtualUser = {
    path: node.getSourceFile().fileName,
    exportedName,
    actor,
  }

  // The generated `pikkuVirtualUser` types this as a union, so a bad value only
  // reaches here in source that does not compile. Caught anyway: a disposition
  // is the entire behaviour, and defaulting a typo to `realistic` would run a
  // different user than the one that was written.
  const declaredDisposition = stringProperty(config, 'disposition')
  const known = Object.keys(DISPOSITIONS)
  if (
    declaredDisposition !== undefined &&
    !known.includes(declaredDisposition)
  ) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `pikkuVirtualUser('${exportedName}') has an unknown disposition '${declaredDisposition}'. One of: ${known.join(', ')}`
    )
    return
  }

  const name = stringProperty(config, 'name')
  const description = stringProperty(config, 'description')
  const disposition = declaredDisposition
  const goals = stringArrayProperty(config, 'goals')
  const tags = stringArrayProperty(config, 'tags')
  const grants = stringArrayProperty(config, 'grants')
  const fixtures = stringArrayProperty(config, 'fixtures')
  const allowApprovalRequired = booleanProperty(config, 'allowApprovalRequired')
  const budget = budgetProperty(config)

  let tuningFailed = false
  const tuning = tuningProperty(config, (message) => {
    tuningFailed = true
    logger.critical(
      ErrorCode.INVALID_VALUE,
      `pikkuVirtualUser('${exportedName}'): ${message}`
    )
  })
  if (tuningFailed) {
    return
  }

  if (name !== undefined) {
    virtualUser.name = name
  }
  if (description !== undefined) {
    virtualUser.description = description
  }
  if (disposition !== undefined) {
    virtualUser.disposition = disposition
  }
  if (tuning !== undefined) {
    virtualUser.tuning = tuning
  }
  if (goals !== undefined) {
    virtualUser.goals = goals
  }
  if (tags !== undefined) {
    virtualUser.tags = tags
  }
  if (grants !== undefined) {
    virtualUser.grants = grants
  }
  if (fixtures !== undefined) {
    virtualUser.fixtures = fixtures
  }
  if (allowApprovalRequired !== undefined) {
    virtualUser.allowApprovalRequired = allowApprovalRequired
  }
  if (budget !== undefined) {
    virtualUser.budget = budget
  }

  state.workflows.virtualUserFiles.set(exportedName, virtualUser)
}
