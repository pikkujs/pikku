import * as ts from 'typescript'
import type { InspectorLogger, InspectorState } from '../types.js'
import { callsImportedDefiner, exportedName } from './add-analytics.js'
import { propertyInitializer, stringProperty } from './add-outgoing-webhook.js'
import { extractFunctionName } from '../utils/extract-function-name.js'

const DEFINE_INCOMING_WEBHOOK = 'defineIncomingWebhook'

const stringArrayProperty = (
  object: ts.ObjectLiteralExpression,
  key: string
): string[] | null => {
  const value = propertyInitializer(object, key)
  if (!value) return []
  if (!ts.isArrayLiteralExpression(value)) return null
  const items: string[] = []
  for (const element of value.elements) {
    if (
      !ts.isStringLiteral(element) &&
      !ts.isNoSubstitutionTemplateLiteral(element)
    )
      return null
    items.push(element.text)
  }
  return items
}

export const addIncomingWebhook = (
  logger: InspectorLogger,
  node: ts.Node,
  checker: ts.TypeChecker,
  state: InspectorState
) => {
  if (!ts.isVariableDeclaration(node)) return
  const { initializer, name } = node
  if (!initializer || !ts.isCallExpression(initializer)) return
  if (
    !callsImportedDefiner(
      initializer.expression,
      checker,
      DEFINE_INCOMING_WEBHOOK
    )
  )
    return
  if (!ts.isIdentifier(name)) return

  const file = node.getSourceFile().fileName
  const [argument] = initializer.arguments
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    logger.error(
      `defineIncomingWebhook in ${file} must be called with an object literal: { id, func, upsert }.`
    )
    return
  }

  const id = stringProperty(argument, 'id')
  if (!id || id.includes('/') || id.includes(':')) {
    logger.error(
      `defineIncomingWebhook '${name.text}' in ${file} needs 'id' as a string literal without '/' or ':', since it becomes part of the route.`
    )
    return
  }

  const events = stringArrayProperty(argument, 'events')
  const needs = stringArrayProperty(argument, 'needs')
  if (!events || !needs) {
    logger.error(
      `defineIncomingWebhook '${id}' in ${file}: 'events' and 'needs' must be arrays of string literals, so they can be read without running the app.`
    )
    return
  }

  const funcExpression = propertyInitializer(argument, 'func')
  const pikkuFuncId = funcExpression
    ? extractFunctionName(funcExpression, checker, state.rootDir).pikkuFuncId
    : ''
  if (!pikkuFuncId || pikkuFuncId.startsWith('__temp_')) {
    logger.error(
      `defineIncomingWebhook '${id}' in ${file}: 'func' must reference a pikku function declared on its own.`
    )
    return
  }

  const variable = exportedName(node, name, checker)
  if (!variable) {
    logger.error(
      `defineIncomingWebhook '${id}' in ${file} is assigned to '${name.text}', which the module does not export. The generated definitions import it by name, so export it.`
    )
    return
  }

  const webhooks = (state.incomingWebhooks ??= [])
  const existing = webhooks.findIndex(
    (webhook) => webhook.file === file && webhook.variable === variable
  )
  const declared = webhooks.find(
    (webhook, index) => webhook.id === id && index !== existing
  )
  if (declared) {
    logger.error(
      `Incoming webhook '${id}' is declared twice: ${declared.file} and ${file}.`
    )
    return
  }

  const title = stringProperty(argument, 'title')
  const secret = stringProperty(argument, 'secret')
  const route = stringProperty(argument, 'route')
  const entry = {
    file,
    variable,
    id,
    pikkuFuncId,
    events,
    needs,
    ...(title !== undefined ? { title } : {}),
    ...(secret !== undefined ? { secret } : {}),
    ...(route !== undefined ? { route } : {}),
  }
  if (existing >= 0) webhooks[existing] = entry
  else webhooks.push(entry)
}
