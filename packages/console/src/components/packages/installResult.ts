import type { QueryClient } from '@tanstack/react-query'

/**
 * What `console:installAddon` reports back about the addon it just wired.
 *
 * A freshly-wired addon is not queryable until the server re-inspects the new
 * wiring, and a server that is not `pikku dev` never does — so this is the only
 * account of the install the console is guaranteed to get.
 */
export interface AddonInstallResult {
  success: boolean
  message: string
  restartRequired: boolean
  ready: boolean
  missingSecrets: string[]
  missingVariables: string[]
  namespace: string
}

export const installResultKey = (packageName: string) => [
  'addon-install-result',
  packageName,
]

/**
 * Held in the query cache rather than passed through navigation state: the
 * install is submitted from the gallery drawer and read on the package detail
 * page, which is a route change, and the cache already survives it.
 */
export const rememberInstallResult = (
  queryClient: QueryClient,
  packageName: string,
  result: AddonInstallResult
) => {
  queryClient.setQueryData(installResultKey(packageName), result)
}

export const readInstallResult = (
  queryClient: QueryClient,
  packageName: string
): AddonInstallResult | undefined =>
  queryClient.getQueryData<AddonInstallResult>(installResultKey(packageName))
