import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ScenarioRunRecord,
  ScenarioRunSummary,
} from '@pikku/core/scenario'
import { usePikkuHTTP, usePikkuRPC } from '../context/PikkuRpcProvider'
import {
  SCENARIO_RUN_POLL_MS,
  hasActiveScenarioRun,
  isScenarioRunActive,
  scenarioRunQueryKeys,
} from './scenario-run-query-keys'

export function useScenarioRuns(limit = 50) {
  const rpc = usePikkuRPC()

  return useQuery<ScenarioRunSummary[]>({
    queryKey: scenarioRunQueryKeys.runs(limit),
    queryFn: async () =>
      (await rpc.invoke('console:listScenarioRuns', {
        limit,
      })) as ScenarioRunSummary[],
    refetchInterval: (query) =>
      hasActiveScenarioRun(query.state.data) ? SCENARIO_RUN_POLL_MS : false,
  })
}

export function useScenarioRun(runId: string | null) {
  const rpc = usePikkuRPC()

  return useQuery<ScenarioRunRecord | null>({
    queryKey: scenarioRunQueryKeys.run(runId),
    queryFn: async () =>
      (await rpc.invoke('console:getScenarioRun', {
        runId: runId!,
      })) as ScenarioRunRecord | null,
    enabled: !!runId,
    // A run in flight grows a scenario at a time, so the open run re-reads
    // itself until it settles.
    refetchInterval: (query) =>
      isScenarioRunActive(query.state.data?.status)
        ? SCENARIO_RUN_POLL_MS
        : false,
  })
}

export function useDeleteScenarioRun() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (runId: string) =>
      rpc.invoke('console:deleteScenarioRun', { runId }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: scenarioRunQueryKeys.allRuns(),
      })
    },
  })
}

export interface ScenarioArtifactSource {
  url?: string
  error?: string
  loading: boolean
}

/**
 * An object URL for one screenshot or recording.
 *
 * The bytes are fetched rather than pointed at, because an `<img src>` cannot
 * carry the console's Authorization header — a token-authenticated console
 * would get a 401 from a plain URL, and the route is authenticated on purpose.
 *
 * Deliberately not a react-query entry: the value is a handle that has to be
 * revoked, and tying its lifetime to the component that shows it is what keeps
 * a run full of footage from pinning every frame of it for the session.
 */
export function useScenarioArtifact(
  runId: string | null,
  path?: string
): ScenarioArtifactSource {
  const http = usePikkuHTTP()
  const [source, setSource] = useState<ScenarioArtifactSource>({
    loading: true,
  })

  useEffect(() => {
    if (!runId || !path) {
      setSource({ loading: false })
      return
    }
    let objectUrl: string | undefined
    let cancelled = false
    setSource({ loading: true })
    http
      .fetch('/scenario-run/:runId/artifact', 'GET', { runId, path })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Artifact unavailable (${response.status})`)
        }
        const blob = await response.blob()
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setSource({ url: objectUrl, loading: false })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setSource({
          error: error instanceof Error ? error.message : String(error),
          loading: false,
        })
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [http, runId, path])

  return source
}
