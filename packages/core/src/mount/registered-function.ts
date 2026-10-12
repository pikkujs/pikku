import { addFunction } from '../function/function-runner.js'
import { pikkuState } from '../pikku-state.js'

export const ensureFunction = (
  kind: string,
  label: string,
  pikkuFuncId: string,
  packageName: string | null,
  func: unknown
): (() => void) => {
  const registered = pikkuState(packageName, 'function', 'functions')
  const hasMeta = Boolean(
    pikkuState(packageName, 'function', 'meta')[pikkuFuncId]
  )
  if (func) {
    if (!hasMeta) {
      throw new Error(
        `${kind} "${label}" uses function "${pikkuFuncId}" which has no function metadata in ${packageName ? `package "${packageName}"` : 'the host'}`
      )
    }
    const previous = registered.get(pikkuFuncId)
    addFunction(pikkuFuncId, func as never, packageName)
    return () => {
      if (previous) registered.set(pikkuFuncId, previous)
      else registered.delete(pikkuFuncId)
    }
  }
  if (!registered.has(pikkuFuncId) || !hasMeta) {
    throw new Error(
      `${kind} "${label}" uses function "${pikkuFuncId}" which ${packageName ? `package "${packageName}"` : 'the host'} has not registered; import its generated bootstrap first`
    )
  }
  return () => {}
}
