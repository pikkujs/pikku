import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

export function useAddonFunctions() {
  const rpc = usePikkuRPC()

  return useQuery({
    queryKey: ['addon-functions'],
    queryFn: async () => {
      const addons = await rpc.invoke('console:getInstalledAddons', null)
      const results: Array<{ namespace: string; funcId: string }> = []

      await Promise.all(
        addons
          .filter((a: any) => a.namespace !== 'console')
          .map(async (addon: any) => {
            try {
              const pkg = await rpc.invoke('console:getAddonInstalledPackage', {
                packageName: addon.packageName,
              })
              const funcs = pkg?.functions || {}
              for (const funcName of Object.keys(funcs)) {
                results.push({
                  namespace: addon.namespace,
                  funcId: `${addon.namespace}:${funcName}`,
                })
              }
            } catch {
              // addon might not have detailed info
            }
          })
      )

      return results
    },
  })
}
