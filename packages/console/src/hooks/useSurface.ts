import { useQuery } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type {
  SurfaceDoc,
  SurfaceUsage,
} from '../components/surface/surface.types'

export interface SurfaceResult {
  doc?: SurfaceDoc
  /** Absent until the inspector has measured the project at least once. */
  usage?: SurfaceUsage
  loading: boolean
}

/**
 * The public surface: the doc shipped with the CLI that built this project, and
 * the import counts measured for it. Neither is expected to change while the
 * console is open, so it is read once and kept.
 */
export const useSurface = (): SurfaceResult => {
  const rpc = usePikkuRPC()

  const { data, isLoading } = useQuery({
    queryKey: ['console:getSurface'],
    queryFn: async () =>
      (await rpc.invoke('console:getSurface')) as {
        doc: SurfaceDoc | null
        usage: SurfaceUsage
      },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  return { doc: data?.doc ?? undefined, usage: data?.usage, loading: isLoading }
}
