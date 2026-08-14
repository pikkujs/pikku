import * as ts from 'typescript'
import { DISPOSITIONS } from '@pikku/core/ecosystem/virtual-user'
import { isRunnablePersona } from '@pikku/core/persona'
import type { PersonaMeta } from '@pikku/core/persona'
import type { PersonaAccountMeta } from '@pikku/core/ecosystem/persona'
import { ErrorCode } from '../error-codes.js'
import { claimSingleDeclaration } from '../utils/single-declaration.js'
import type { AddWiring, InspectorLogger } from '../types.js'
import {
  booleanProperty,
  getProperty,
  numberProperty,
  stringArrayProperty,
  stringProperty,
  unwrapAs,
} from '../utils/literal-properties.js'

type Tuning = NonNullable<PersonaMeta['tuning']>

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
 * double every call the persona makes, and you would read the run as a product
 * bug.
 */
const tuningProperty = (
  config: ts.ObjectLiteralExpression,
  onError: (message: string) => void
): Tuning | undefined => {
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

const accountProperty = (
  value: ts.Expression | undefined
): PersonaAccountMeta | undefined => {
  if (!value || !ts.isObjectLiteralExpression(value)) {
    return undefined
  }
  const provider = stringProperty(value, 'provider')
  return provider === undefined ? {} : { provider }
}

const linkedAccountsProperty = (
  config: ts.ObjectLiteralExpression,
  personaId: string,
  logger: InspectorLogger
): Record<string, PersonaAccountMeta> | undefined => {
  const value = getProperty(config, 'linkedAccounts')
  if (!value || !ts.isObjectLiteralExpression(value)) {
    return undefined
  }

  const accounts: Record<string, PersonaAccountMeta> = {}
  for (const prop of value.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue
    }
    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        `Persona '${personaId}' has a linked account whose key is not a literal.`
      )
      continue
    }
    const account = accountProperty(prop.initializer)
    if (!account) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Persona '${personaId}' linked account '${prop.name.text}' must be an object literal.`
      )
      continue
    }
    accounts[prop.name.text] = account
  }

  return Object.keys(accounts).length ? accounts : undefined
}

/**
 * Inspector for `definePersonas()` calls.
 *
 * A persona is entirely declaration — a person, their roles, what they want —
 * so there is no code body and nothing to resolve at runtime. What is read here
 * is the whole thing, and it is generated straight to `personas.gen.json` for
 * the CLI and the console to read without loading the app.
 *
 * `name` is the one field that cannot be defaulted. A persona without one is
 * not a person, and the console has nothing to show.
 */
export const addPersonas: AddWiring = (logger, node, _checker, state) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const expression = node.expression
  if (!ts.isIdentifier(expression) || expression.text !== 'definePersonas') {
    return
  }

  const firstArg = node.arguments[0]
  if (!firstArg) {
    return
  }

  const unwrapped = unwrapAs(firstArg)
  if (!ts.isObjectLiteralExpression(unwrapped)) {
    logger.critical(
      ErrorCode.INVALID_VALUE,
      'definePersonas() needs an inline object — personas are read statically, never evaluated.'
    )
    return
  }

  const sourceFile = node.getSourceFile().fileName

  if (
    !claimSingleDeclaration(
      logger,
      state.personas.files,
      ErrorCode.DUPLICATE_PERSONAS_DEFINITION,
      'definePersonas',
      sourceFile
    )
  ) {
    return
  }

  const known = Object.keys(DISPOSITIONS)

  for (const prop of unwrapped.properties) {
    if (!ts.isPropertyAssignment(prop)) {
      continue
    }

    if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) {
      logger.critical(
        ErrorCode.NON_LITERAL_WIRE_NAME,
        'A persona is declared with a key that is not a literal.'
      )
      continue
    }
    const id = prop.name.text

    if (!ts.isObjectLiteralExpression(prop.initializer)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Persona '${id}' must be an object literal.`
      )
      continue
    }
    const config = prop.initializer

    const name = stringProperty(config, 'name')
    if (!name) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Persona '${id}' needs a literal 'name' — a persona is a person, and the console has nothing to show without one.`
      )
      continue
    }

    // The generated `definePersonas` types this as a union, so a bad value only
    // reaches here in source that does not compile. Caught anyway: a
    // disposition is the entire behaviour, and defaulting a typo to `realistic`
    // would run a different person than the one that was written.
    const disposition = stringProperty(config, 'disposition')
    if (disposition !== undefined && !known.includes(disposition)) {
      logger.critical(
        ErrorCode.INVALID_VALUE,
        `Persona '${id}' has an unknown disposition '${disposition}'. One of: ${known.join(', ')}`
      )
      continue
    }

    let tuningFailed = false
    const tuning = tuningProperty(config, (message) => {
      tuningFailed = true
      logger.critical(ErrorCode.INVALID_VALUE, `Persona '${id}': ${message}`)
    })
    if (tuningFailed) {
      continue
    }

    const account = accountProperty(getProperty(config, 'account'))
    const declaredRunnable = booleanProperty(config, 'runnable')

    const persona: PersonaMeta = {
      id,
      name,
      roles: stringArrayProperty(config, 'roles') ?? [],
      goals: stringArrayProperty(config, 'goals') ?? [],
      tags: stringArrayProperty(config, 'tags') ?? [],
      runnable: isRunnablePersona({
        ...(declaredRunnable !== undefined
          ? { runnable: declaredRunnable }
          : {}),
        ...(account ? { account } : {}),
      }),
      sourceFile,
    }

    const jobTitle = stringProperty(config, 'jobTitle')
    if (jobTitle !== undefined) persona.jobTitle = jobTitle
    const description = stringProperty(config, 'description')
    if (description !== undefined) persona.description = description
    const avatarUrl = stringProperty(config, 'avatarUrl')
    if (avatarUrl !== undefined) persona.avatarUrl = avatarUrl
    const personality = stringProperty(config, 'personality')
    if (personality !== undefined) persona.personality = personality
    if (disposition !== undefined) {
      persona.disposition = disposition as PersonaMeta['disposition']
    }
    if (tuning !== undefined) persona.tuning = tuning
    const fixtures = stringArrayProperty(config, 'fixtures')
    if (fixtures !== undefined) persona.fixtures = fixtures
    // Left absent rather than resolved here: "everywhere but production" is a
    // fact about the config, and the inspector has no business baking today's
    // environment list into a meta file that outlives it.
    const environments = stringArrayProperty(config, 'environments')
    if (environments !== undefined) persona.environments = environments
    if (account !== undefined) persona.account = account
    const linkedAccounts = linkedAccountsProperty(config, id, logger)
    if (linkedAccounts !== undefined) persona.linkedAccounts = linkedAccounts

    state.personas.definitions.push(persona)
  }
}
