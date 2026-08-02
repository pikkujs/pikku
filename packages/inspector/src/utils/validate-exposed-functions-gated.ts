import { ErrorCode } from '../error-codes.js'
import type { InspectorLogger, InspectorState } from '../types.js'

/**
 * A function reachable through the generated `POST /rpc/:rpcName` dispatcher
 * that nothing will stop.
 *
 * `rpc.exposed` refuses anything without `expose: true`, so the population is
 * small and deliberate — someone typed it. What makes one dangerous is the
 * combination: exposed, sessionless, and carrying no gate of its own or from
 * the addon it belongs to. The dispatcher cannot help, because it does not know
 * what it is dispatching to.
 *
 * knowledge: decisions/security/console-addon-privileged-functions-gate-themselves.md
 */
export function validateExposedFunctionsGated(
  logger: InspectorLogger,
  state: InspectorState
): void {
  const ungated: string[] = []

  for (const [funcName, meta] of Object.entries(state.functions.meta)) {
    if (!meta.expose) continue

    // A pikkuFunc always requires a session, on every path.
    if (meta.sessionless === false) continue

    // Scenario steps are refused by rpcExposed regardless of `expose`.
    if (meta.scenarioStep) continue

    // The author declared that the body authorizes its own callers — a gate
    // this check has no way to see. Taking the claim at face value is the
    // point: without it the warning fires forever on functions that are fine,
    // and a warning that is usually wrong stops being read.
    if (meta.selfAuthenticated === true) continue

    // The function gates itself.
    if (meta.auth === true) continue
    if (meta.scopes && meta.scopes.length > 0) continue
    if (meta.permissions && meta.permissions.length > 0) continue

    if (isGatedByItsAddon(state, meta.packageName)) continue

    ungated.push(funcName)
  }

  if (ungated.length === 0) return

  const shown = ungated.slice(0, 10)
  const rest = ungated.length - shown.length

  logger.diagnostic({
    severity: 'warn',
    code: ErrorCode.EXPOSED_FUNCTION_HAS_NO_GATE,
    message:
      `${ungated.length} exposed function${ungated.length === 1 ? '' : 's'} ` +
      `require neither a session nor any permission or scope, and ` +
      `${ungated.length === 1 ? 'is' : 'are'} reachable by anyone through ` +
      `POST /rpc/:rpcName: ${shown.join(', ')}` +
      (rest > 0 ? `, and ${rest} more` : '') +
      `. Add scopes or permissions to the function, gate the whole addon with ` +
      `wireAddon({ scopes: [...] }), or drop \`expose: true\` if it was not ` +
      `meant to be callable from outside.`,
  })
}

/**
 * Whether every function in this package is already gated by its `wireAddon`.
 * Those gates are applied by `runPikkuFunc` on every wiring path, so a function
 * with no gate of its own is still covered by them.
 *
 * An addon whose `scopes`/`auth` were not statically knowable reads as
 * unknown, and unknown is treated as gated — a false negative here costs a
 * missing warning, a false positive costs trust in every warning.
 *
 * knowledge: decisions/security/addon-scopes-are-resolved-where-the-function-runs.md
 */
function isGatedByItsAddon(
  state: InspectorState,
  packageName: string | undefined
): boolean {
  if (!packageName) return false

  const declarations = state.rpc?.wireAddonDeclarations
  if (!declarations) return false

  for (const declaration of declarations.values()) {
    if (declaration.package !== packageName) continue
    if (declaration.auth === true) return true
    if (declaration.scopes && declaration.scopes.length > 0) return true
  }

  return false
}
