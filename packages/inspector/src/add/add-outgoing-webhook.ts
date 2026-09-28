import * as ts from 'typescript'
import type { InspectorLogger, InspectorState } from '../types.js'
import {
  callsImportedDefiner,
  exportedName,
  readEventShape,
} from './add-analytics.js'

const DEFINE_OUTGOING_WEBHOOK = 'defineOutgoingWebhook'

export const stringProperty = (
  object: ts.ObjectLiteralExpression,
  key: string
): string | undefined => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    const text =
      ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined
    if (text !== key) continue
    const value = property.initializer
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
      return value.text
    return undefined
  }
  return undefined
}

export const propertyInitializer = (
  object: ts.ObjectLiteralExpression,
  key: string
): ts.Expression | undefined => {
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    if (
      (ts.isIdentifier(name) || ts.isStringLiteral(name)) &&
      name.text === key
    )
      return property.initializer
  }
  return undefined
}

export const addOutgoingWebhook = (
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
      DEFINE_OUTGOING_WEBHOOK
    )
  )
    return
  if (!ts.isIdentifier(name)) return

  const file = node.getSourceFile().fileName
  const [argument] = initializer.arguments
  if (!argument || !ts.isObjectLiteralExpression(argument)) {
    logger.error(
      `defineOutgoingWebhook in ${file} must be called with an object literal: { event, title, payload }.`
    )
    return
  }

  const event = stringProperty(argument, 'event')
  const title = stringProperty(argument, 'title')
  if (!event || !title) {
    logger.error(
      `defineOutgoingWebhook '${name.text}' in ${file} needs 'event' and 'title' as string literals, so they can be listed without running the app.`
    )
    return
  }

  const variable = exportedName(node, name, checker)
  if (!variable) {
    logger.error(
      `defineOutgoingWebhook '${event}' in ${file} is assigned to '${name.text}', which the module does not export. The generated webhook types import it by name, so export it.`
    )
    return
  }

  const description = stringProperty(argument, 'description')
  const payloadExpression = propertyInitializer(argument, 'payload')
  const payload = payloadExpression
    ? readEventShape(payloadExpression)
    : undefined

  const webhooks = (state.outgoingWebhooks ??= [])
  const existing = webhooks.findIndex(
    (webhook) => webhook.file === file && webhook.variable === variable
  )
  const declared = webhooks.find(
    (webhook, index) => webhook.event === event && index !== existing
  )
  if (declared) {
    logger.error(
      `Webhook event '${event}' is declared twice: ${declared.file} and ${file}. An event belongs to one defineOutgoingWebhook.`
    )
    return
  }

  const entry = {
    file,
    variable,
    event,
    title,
    ...(description !== undefined ? { description } : {}),
    ...(payload ? { payload } : {}),
  }
  if (existing >= 0) webhooks[existing] = entry
  else webhooks.push(entry)
}
