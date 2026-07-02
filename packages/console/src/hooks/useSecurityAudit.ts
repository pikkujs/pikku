import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'

// Canonical `.pikku/audit.json` artifact shape lives in @pikku/core — re-exported
// here so console pages/components have a single import site.
export type {
  SecurityAuditReport,
  SecurityAuditIssue,
  SecurityAuditUpdate,
  SecuritySeverity,
  SecurityUpdateLevel,
} from '@pikku/core'
import type { SecurityAuditReport } from '@pikku/core'

export function useSecurityAudit(): {
  report: SecurityAuditReport | null
  isLoading: boolean
} {
  const rpc = usePikkuRPC()

  // No placeholderData: in TanStack Query v5 a placeholder flips the query to
  // success immediately (isLoading === false on first render), which would make
  // SecurityPage skip the loader and flash the empty state mid-fetch.
  const { data, isLoading } = useQuery({
    queryKey: ['security-audit'],
    queryFn: async () =>
      (await rpc.invoke('console:getSecurityAudit')) as SecurityAuditReport | null,
  })

  return { report: data ?? null, isLoading }
}

// Triggers `pikku audit` server-side (regenerating .pikku/audit.json), then
// refetches the report — same shape as the Run Tests action.
export function useRunSecurityAudit() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () =>
      (await rpc.invoke('console:runSecurityAudit')) as SecurityAuditReport | null,
    onSuccess: (report) => {
      // A transient null (read/parse race after regenerating audit.json) must
      // not wipe a previously-good report and flip the page to its empty state.
      if (report) queryClient.setQueryData(['security-audit'], report)
    },
  })
}

// OSS mechanical remediation: bump the package in package.json, run bun
// install, re-audit, and swap in the refreshed report. It does NOT run or
// verify the app — Fabric replaces this action with a sandbox-verified fix.
export function useUpdateDependency() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (vars: { package: string; version: string }) =>
      (await rpc.invoke(
        'console:updateDependency',
        vars
      )) as SecurityAuditReport | null,
    onSuccess: (report) => {
      if (report) queryClient.setQueryData(['security-audit'], report)
    },
  })
}
