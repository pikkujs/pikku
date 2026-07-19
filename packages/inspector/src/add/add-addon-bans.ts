import * as ts from 'typescript'
import type { AddWiring } from '../types.js'
import { ErrorCode } from '../error-codes.js'

/**
 * Wiring helpers an addon must not call. Addons declare contracts with the
 * define* helpers and export functions; the consuming app does the wiring via
 * refHTTP / refChannel / refCLI. Service declarations remain allowed.
 */
const BANNED_WIRINGS = new Set([
  'wireAddon',
  'wireRemoteAddon',
  'wireChannel',
  'wireCLI',
  'wireGateway',
  'wireHTTP',
  'wireHTTPRoutes',
  'wireMCPPrompt',
  'wireMCPResource',
  'wireQueueWorker',
  'wireScheduler',
  'wireTrigger',
  'wireTriggerSource',
])

const CONTRACT_DEFINERS = new Set([
  'defineHTTPRoutes',
  'defineChannelRoutes',
  'defineCLICommands',
])

const hasHandlerProperty = (node: ts.Node): boolean => {
  let found = false
  const visit = (current: ts.Node) => {
    if (found) return
    if (
      ts.isPropertyAssignment(current) &&
      (ts.isIdentifier(current.name) || ts.isStringLiteral(current.name)) &&
      (current.name.text === 'middleware' ||
        current.name.text === 'permissions')
    ) {
      found = true
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return found
}

/**
 * Enforce addon authoring rules. Only runs when inspecting an addon package
 * (options.isAddon). Addons cannot wire transports, and their contracts cannot
 * carry middleware or permissions — those are the consuming app's concern.
 */
export const checkAddonBans: AddWiring = (
  logger,
  node,
  _checker,
  _state,
  options
) => {
  if (!options.isAddon) return
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return

  const name = node.expression.text

  if (BANNED_WIRINGS.has(name)) {
    logger.critical(
      ErrorCode.ADDON_WIRING_NOT_ALLOWED,
      `Addons must not call '${name}'. Declare contracts with define* and export functions; the consuming app wires them via refHTTP / refChannel / refCLI.`
    )
    return
  }

  if (CONTRACT_DEFINERS.has(name)) {
    const [arg] = node.arguments
    if (arg && hasHandlerProperty(arg)) {
      logger.critical(
        ErrorCode.ADDON_CONTRACT_HANDLERS_NOT_ALLOWED,
        `Addon contract '${name}' must not declare middleware or permissions — these are applied by the consuming app, not the addon.`
      )
    }
  }
}
