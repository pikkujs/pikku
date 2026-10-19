import { ForbiddenError } from '../../errors/errors.js'
import { PikkuError, addError } from '../../errors/error-handler.js'
import { ADDON_HEADER } from '../../middleware/addon-scope-cap.js'
import { pikkuState } from '../../pikku-state.js'
import type { PikkuRawWire } from '../../types/core.types.js'

export const addonMayReach = (caller: string, funcName: string): boolean => {
  const target = funcName.slice(0, Math.max(funcName.indexOf(':'), 0))
  if (!target) return false
  if (target === caller) return true
  const uses = pikkuState(null, 'addons', 'packages').get(caller)?.uses
  return !!uses && Object.values(uses).includes(target)
}

export const addonCallerOf = (wire: PikkuRawWire): string | undefined => {
  const name = wire.http?.request?.header(ADDON_HEADER)
  if (!name) return undefined
  if (!pikkuState(null, 'addons', 'packages').has(name)) {
    throw new ForbiddenError(`Unknown addon '${name}'`)
  }
  return name
}

export class AddonNotUsedError extends PikkuError {
  constructor(caller: string, target: string) {
    super(
      `Addon '${caller}' called '${target}' but does not list it in its wireAddon 'uses'.`
    )
  }
}
addError(AddonNotUsedError, {
  status: 403,
  message: 'Addon called another addon it does not use.',
})

/**
 * The name an addon's call resolves to on this host, through its `uses`.
 *
 * knowledge: decisions/security/an-addon-may-reach-only-itself-and-the-addons-it-uses.md
 */
export const mapAddonCall = (
  caller: string | undefined,
  funcName: string
): string => {
  if (!caller) return funcName
  const colon = funcName.indexOf(':')
  if (colon === -1) return funcName
  const prefix = funcName.slice(0, colon)
  if (prefix === caller) return funcName
  const mapped = pikkuState(null, 'addons', 'packages').get(caller)?.uses?.[
    prefix
  ]
  if (mapped) return `${mapped}${funcName.slice(colon)}`
  throw new AddonNotUsedError(caller, funcName)
}
