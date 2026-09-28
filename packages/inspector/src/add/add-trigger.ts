import * as ts from 'typescript'
import {
  getPropertyValue,
  getCommonWireMetaData,
} from '../utils/get-property-value.js'
import type { AddWiring } from '../types.js'
import {
  extractFunctionName,
  makeContextBasedId,
} from '../utils/extract-function-name.js'
import { getPropertyAssignmentInitializer } from '../utils/type-utils.js'
import { ensureInlineWiringFunction } from '../utils/ensure-function-metadata.js'
import { resolveMiddleware } from '../utils/middleware.js'
import { extractWireNames } from '../utils/post-process.js'
import { resolveAddonName } from '../utils/resolve-addon-package.js'
import { resolveFunctionMeta } from '../utils/resolve-function-meta.js'

import { ErrorCode } from '../error-codes.js'
import type { WebhookSourceMeta } from '@pikku/core/trigger'

const WEBHOOK_SOURCE_STEPS = ['receive', 'check', 'setup', 'teardown'] as const

export const addTrigger: AddWiring = (
  logger,
  node,
  checker,
  state,
  options
) => {
  if (!ts.isCallExpression(node)) {
    return
  }

  const args = node.arguments
  const firstArg = args[0]
  const expression = node.expression

  if (!ts.isIdentifier(expression)) {
    return
  }

  if (expression.text === 'wireTrigger') {
    addWireTrigger(logger, node, checker, state, firstArg)
  } else if (expression.text === 'wireTriggerSource') {
    addWireTriggerSource(logger, node, checker, state, options, firstArg)
  } else if (expression.text === 'wireTriggerWebhookSource') {
    addWireTriggerWebhookSource(logger, node, checker, state, firstArg)
  }
}

const addWireTrigger: (
  logger: Parameters<AddWiring>[0],
  node: ts.CallExpression,
  checker: Parameters<AddWiring>[2],
  state: Parameters<AddWiring>[3],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, firstArg) => {
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const obj = firstArg

  const nameValue = getPropertyValue(obj, 'name') as string | null
  const { disabled, tags, summary, description, errors } =
    getCommonWireMetaData(obj, 'Trigger', nameValue, logger, checker)

  if (disabled) return

  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for trigger '${nameValue}'.`
    )
    return
  }

  const extracted = extractFunctionName(funcInitializer, checker, state.rootDir)
  let pikkuFuncId = extracted.pikkuFuncId
  if (pikkuFuncId.startsWith('__temp_') && nameValue) {
    pikkuFuncId = makeContextBasedId('trigger', nameValue)
  }

  if (!nameValue) {
    return
  }

  // Register metadata for a func inlined into the wiring (see helper).
  ensureInlineWiringFunction(
    state,
    pikkuFuncId,
    nameValue,
    funcInitializer,
    checker,
    extracted.isHelper
  )

  // --- resolve middleware ---
  const middleware = resolveMiddleware(state, obj, tags, checker)

  // --- track used functions/middleware for service aggregation ---
  state.serviceAggregation.usedFunctions.add(pikkuFuncId)
  extractWireNames(middleware).forEach((name) =>
    state.serviceAggregation.usedMiddleware.add(name)
  )

  state.triggers.files.add(node.getSourceFile().fileName)
  state.triggers.meta[nameValue] = {
    pikkuFuncId,
    name: nameValue,
    summary,
    description,
    errors,
    tags,
    middleware,
  }
}

const addWireTriggerSource: (
  logger: Parameters<AddWiring>[0],
  node: ts.CallExpression,
  checker: Parameters<AddWiring>[2],
  state: Parameters<AddWiring>[3],
  options: Parameters<AddWiring>[4],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, options, firstArg) => {
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }

  const obj = firstArg

  const nameValue = getPropertyValue(obj, 'name') as string | null
  if (!nameValue) {
    return
  }

  const funcInitializer = getPropertyAssignmentInitializer(
    obj,
    'func',
    true,
    checker
  )
  if (!funcInitializer) {
    logger.critical(
      ErrorCode.MISSING_FUNC,
      `No valid 'func' property for trigger source '${nameValue}'.`
    )
    return
  }

  if (ts.isIdentifier(funcInitializer)) {
    const packageName = resolveAddonName(
      funcInitializer,
      checker,
      state.rpc.wireAddonDeclarations
    )
    state.triggers.sourceMeta[nameValue] = {
      name: nameValue,
      pikkuFuncId: funcInitializer.text,
      packageName: packageName || undefined,
    }
  }

  state.triggers.files.add(node.getSourceFile().fileName)
}

const refTarget = (initializer: ts.Expression): string | null => {
  if (
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== 'ref'
  ) {
    return null
  }
  const [target] = initializer.arguments
  return target && ts.isStringLiteral(target) && target.text.includes(':')
    ? target.text
    : null
}

const addWireTriggerWebhookSource: (
  logger: Parameters<AddWiring>[0],
  node: ts.CallExpression,
  checker: Parameters<AddWiring>[2],
  state: Parameters<AddWiring>[3],
  firstArg: ts.Expression | undefined
) => void = (logger, node, checker, state, firstArg) => {
  if (!firstArg || !ts.isObjectLiteralExpression(firstArg)) {
    return
  }
  const obj = firstArg
  const name = getPropertyValue(obj, 'name') as string | null
  if (!name) {
    logger.critical(
      ErrorCode.MISSING_NAME,
      `wireTriggerWebhookSource in ${node.getSourceFile().fileName} needs 'name' as a string literal.`
    )
    return
  }

  const method = (getPropertyValue(obj, 'method') as string | null) ?? 'post'
  const route =
    (getPropertyValue(obj, 'route') as string | null) ?? `/webhooks/${name}`
  let secret = getPropertyValue(obj, 'secret') as string | null

  const eventsInitializer = getPropertyAssignmentInitializer(
    obj,
    'events',
    false,
    checker
  )
  const events = eventsInitializer
    ? checker
        .getTypeAtLocation(eventsInitializer)
        .getProperties()
        .map((property) => property.getName())
        .sort()
    : []

  const steps: Partial<Record<(typeof WEBHOOK_SOURCE_STEPS)[number], string>> =
    {}
  for (const step of WEBHOOK_SOURCE_STEPS) {
    const initializer = getPropertyAssignmentInitializer(
      obj,
      step,
      true,
      checker
    )
    if (!initializer) continue

    const target = refTarget(initializer)
    if (target) {
      if (!resolveFunctionMeta(state, target)) {
        logger.warn(
          `Webhook source '${name}': addon function metadata for '${target}' is not available yet.`
        )
      }
      steps[step] = target
      state.serviceAggregation.usedFunctions.add(target)
      continue
    }

    const extracted = extractFunctionName(initializer, checker, state.rootDir)
    let pikkuFuncId = extracted.pikkuFuncId
    if (pikkuFuncId.startsWith('__temp_')) {
      pikkuFuncId = makeContextBasedId('trigger-webhook', name, step)
    }
    ensureInlineWiringFunction(
      state,
      pikkuFuncId,
      `${name}:${step}`,
      initializer,
      checker,
      extracted.isHelper
    )
    const meta = state.functions.meta[pikkuFuncId]
    if (meta && meta.sessionless === undefined) meta.sessionless = true
    steps[step] = pikkuFuncId
    state.serviceAggregation.usedFunctions.add(pikkuFuncId)
  }

  // An addon's receive reads the secret by its own name; the app may have
  // renamed it for this instance.
  const namespace = steps.receive?.includes(':')
    ? steps.receive.slice(0, steps.receive.indexOf(':'))
    : null
  const addon = namespace
    ? state.rpc.wireAddonDeclarations.get(namespace)
    : undefined
  if (secret && addon?.secretOverrides?.[secret]) {
    secret = addon.secretOverrides[secret]!
  }

  const meta: WebhookSourceMeta = {
    name,
    method: method as WebhookSourceMeta['method'],
    route,
    events,
    ...(secret ? { secret } : {}),
    ...steps,
  }
  state.triggers.webhookSourceMeta[name] = meta
  state.triggers.files.add(node.getSourceFile().fileName)
}

/**
 * A trigger named `<source>:<event>` must name an event its webhook source
 * declares, or it would never fire.
 */
export const validateWebhookSourceTriggers = (
  logger: Parameters<AddWiring>[0],
  state: Parameters<AddWiring>[3]
) => {
  const sources = state.triggers.webhookSourceMeta
  for (const trigger of Object.keys(state.triggers.meta)) {
    const colon = trigger.indexOf(':')
    if (colon === -1) continue
    const source = sources[trigger.slice(0, colon)]
    if (!source || source.events.length === 0) continue
    const event = trigger.slice(colon + 1)
    if (!source.events.includes(event)) {
      logger.error(
        `Trigger '${trigger}' listens for '${event}', which webhook source '${source.name}' does not declare. Declared: ${source.events.join(', ')}.`
      )
    }
  }
}
