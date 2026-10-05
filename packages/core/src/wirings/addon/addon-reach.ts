import { ForbiddenError } from '../../errors/errors.js'
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
