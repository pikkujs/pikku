import type { InspectorState } from '@pikku/inspector'

/**
 * The addon functions a host exposes, by namespace. An addon function counts
 * when the addon declared it `expose: true` and the wiring opted in, with
 * `true` or a list naming it. This is the rule `rpc.exposed` applies at runtime
 * and the deploy analyzer applies when it cuts units, so what a client SDK
 * carries is exactly what can be called.
 */
export const addonExposedFunctions = (
  state: Pick<InspectorState, 'addonFunctions' | 'rpc'>
): Record<string, string[]> => {
  const exposed: Record<string, string[]> = {}
  for (const [namespace, functions] of Object.entries(
    state.addonFunctions ?? {}
  )) {
    const wired = state.rpc?.wireAddonDeclarations?.get(namespace)?.expose
    exposed[namespace] = Object.entries(functions)
      .filter(
        ([name, meta]) =>
          !!meta.expose &&
          (Array.isArray(wired) ? wired.includes(name) : wired === true)
      )
      .map(([name]) => name)
  }
  return exposed
}

/** `<namespace>:<function>` for every addon function a host exposes. */
export const addonExposedIds = (
  state: Pick<InspectorState, 'addonFunctions' | 'rpc'>
): string[] =>
  Object.entries(addonExposedFunctions(state)).flatMap(([namespace, names]) =>
    names.map((name) => `${namespace}:${name}`)
  )
