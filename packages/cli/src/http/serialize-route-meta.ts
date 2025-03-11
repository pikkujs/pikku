import type { HTTPRoutesMeta } from '@pikku/core/http'

export const serializeHTTPRoutesMeta = (routesMeta: HTTPRoutesMeta) => {
  const serializedOutput: string[] = []
  serializedOutput.push("import { pikkuState } from '@pikku/core'")
  serializedOutput.push(
    `pikkuState('http', 'meta', ${JSON.stringify(routesMeta, null, 2)})`
  )
  return serializedOutput.join('\n')
}
