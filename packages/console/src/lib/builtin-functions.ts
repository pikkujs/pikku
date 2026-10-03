import { toEnglishName } from './strings'

/** A function a Pikku scaffold generated, which tags every one of them `pikku`. */
export const isPikkuFunction = (func: any): boolean =>
  Array.isArray(func?.tags) && func.tags.includes('pikku')

/** A `pikkuScenario` or `pikkuScenarioStep`: test machinery, never a deployed capability. */
export const isScenarioFunction = (func: any): boolean =>
  func?.scenario === true || func?.scenarioStep === true

/** Anything the app did not write as a capability of its own. */
export const isBuiltInFunction = (func: any): boolean =>
  isPikkuFunction(func) || isScenarioFunction(func)

/**
 * Narrows the function list by free-text search, and by whether built-in
 * functions are wanted.
 */
export const filterFunctions = (
  rawFunctions: unknown,
  searchQuery: string,
  showBuiltIn: boolean
): any[] => {
  const all = (rawFunctions ?? []) as any[]
  const q = searchQuery.toLowerCase()
  return all.filter((func: any) => {
    if (!showBuiltIn && isBuiltInFunction(func)) return false
    if (!q) return true
    const funcId = func.pikkuFuncName || func.pikkuFuncId
    return (
      funcId?.toLowerCase().includes(q) ||
      func.displayName?.toLowerCase().includes(q) ||
      toEnglishName(funcId).toLowerCase().includes(q) ||
      func.summary?.toLowerCase().includes(q) ||
      func.description?.toLowerCase().includes(q)
    )
  })
}
