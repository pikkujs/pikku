import { useMemo, useState } from 'react'
import { usePikkuMeta } from '../context/PikkuMetaContext'
import { useSearchParams } from '../router'
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
  const [searchParams] = useSearchParams()
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

  // `?persona=` is how the personas page hands one over. It only seeds the
  // choice — picking someone else in the rail wins from then on, so arriving
  // by link does not pin the page to whoever the url named.
  const linkedId = searchParams.get('persona') ?? undefined
  const selected =
    users.find((user) => user.id === (selectedId ?? linkedId)) ?? users[0]

  return { users, selected, setSelectedId, loading }
}
