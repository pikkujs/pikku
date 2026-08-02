import { useMemo, useState } from 'react'
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
    return toVirtualUserDocs({
      personas: meta.personas ?? {},
      systemRoles: (meta.systemRoles ?? {}) as any,
      functions: Object.fromEntries(
        (meta.functions ?? []).map((fn: any) => [fn.name, fn])
      ) as any,
      workflows: (meta.workflows ?? {}) as any,
      features: (meta.features ?? {}) as any,
    })
  }, [meta])

  const selected = users.find((user) => user.id === selectedId) ?? users[0]

  return { users, selected, setSelectedId, loading }
}
