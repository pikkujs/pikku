import { useMemo } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export interface ServiceItem {
  name: string
  funcCount: number
  functions: string[]
}

/**
 * Every service referenced by a function in the project meta, ranked by how
 * many functions use it. Shared by `ServicesPage` and `ServicesListPanel` so a
 * host can read the same rows without mounting either.
 */
export const useServiceItems = (): {
  items: ServiceItem[]
  loading: boolean
} => {
  const { meta, loading } = usePikkuMeta()

  const items = useMemo((): ServiceItem[] => {
    const serviceMap = new Map<
      string,
      { funcCount: number; functions: string[] }
    >()
    meta.functions?.forEach((func: any) => {
      if (func.services?.services) {
        for (const svc of func.services.services) {
          const existing = serviceMap.get(svc) || {
            funcCount: 0,
            functions: [],
          }
          existing.funcCount++
          existing.functions.push(func.pikkuFuncId)
          serviceMap.set(svc, existing)
        }
      }
    })
    return Array.from(serviceMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.funcCount - a.funcCount)
  }, [meta.functions])

  return { items, loading }
}
