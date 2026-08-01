import { useMemo, useState } from 'react'
import type { VirtualUsersMeta } from '@pikku/core/virtual-user'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import {
  toVirtualUserDocs,
  type VirtualUserDoc,
} from '../components/virtual-users/virtual-user-model'

export interface VirtualUsersBrowse {
  users: VirtualUserDoc[]
  selected?: VirtualUserDoc
  setSelectedId: (id: string) => void
  loading: boolean
}

export function useVirtualUsers(): VirtualUsersBrowse {
  const { meta, loading } = usePikkuMeta()
  const [selectedId, setSelectedId] = useState<string>()

  const users = useMemo(() => {
    // `virtualUsers` reaches the client through the console addon's generated
    // RPC map, so it is only typed once that codegen has run. The shape is
    // core's own, hence the one narrow assertion here rather than `any` through
    // the model.
    const virtualUsers =
      (meta as { virtualUsers?: VirtualUsersMeta }).virtualUsers ?? {}
    return toVirtualUserDocs({
      virtualUsers,
      functions: Object.fromEntries(
        (meta.functions ?? []).map((fn: any) => [fn.name, fn])
      ) as any,
      workflows: (meta.workflows ?? {}) as any,
      scenarioActors: (meta.scenarioActors ?? {}) as any,
      features: (meta.features ?? {}) as any,
    })
  }, [meta])

  const selected = users.find((user) => user.id === selectedId) ?? users[0]

  return { users, selected, setSelectedId, loading }
}
