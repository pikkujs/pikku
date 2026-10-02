import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { FlattenedRPCMap } from '../pikku/rpc-map.gen.d'

type Out<Name extends keyof FlattenedRPCMap> = FlattenedRPCMap[Name]['output']

export type WorkspaceEntry = {
  name: string
  path: string
  type: 'file' | 'directory'
}
export type WorkspaceFile = {
  path: string
  size: number
  content: string
  binary: boolean
  truncated: boolean
}
export type GitFileStatus =
  'staged' | 'modified' | 'untracked' | 'deleted' | 'renamed' | 'conflicted'
export type GitStatusEntry = {
  path: string
  status: GitFileStatus
  index: string
  worktree: string
  from?: string
}
export type GitStatus = {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  clean: boolean
  files: GitStatusEntry[]
}
export type GitCommit = {
  sha: string
  shortSha: string
  author: string
  email: string
  date: string
  subject: string
}
export type GitDiff = { diff: string; truncated: boolean }
export type GitCommitResult = {
  status: 'noop' | 'committed'
  shortSha: string | null
}
export type GitPullResult = Out<'console:pullGitChanges'>
export type GitPushResult = Out<'console:pushGitChanges'>

const GIT_KEYS = [['git-status'], ['git-log'], ['git-diff']] as const

export function useProjectFiles(path: string, enabled = true) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['project-files', path],
    queryFn: async (): Promise<{ entries: WorkspaceEntry[] }> =>
      rpc.invoke('console:listProjectFiles', { path }),
    enabled,
  })
}

export function useProjectFile(path: string | undefined) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['project-file', path],
    queryFn: async (): Promise<WorkspaceFile> =>
      rpc.invoke('console:readProjectFile', { path: path! }),
    enabled: !!path,
  })
}

export function useGitStatus() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['git-status'],
    queryFn: async (): Promise<GitStatus> => rpc.invoke('console:getGitStatus'),
    retry: false,
  })
}

export function useGitLog(enabled: boolean, limit = 30) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['git-log', limit],
    queryFn: async (): Promise<{ commits: GitCommit[] }> =>
      rpc.invoke('console:getGitLog', { limit }),
    enabled,
  })
}

export function useGitDiff(path: string | undefined) {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: ['git-diff', path],
    queryFn: async (): Promise<GitDiff> =>
      rpc.invoke('console:getGitDiff', { path: path! }),
    enabled: !!path,
  })
}

const useRefreshGit = () => {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of GIT_KEYS)
      queryClient.invalidateQueries({ queryKey: [...queryKey] })
    queryClient.invalidateQueries({ queryKey: ['project-files'] })
    queryClient.invalidateQueries({ queryKey: ['project-file'] })
  }
}

export function useCommitChanges() {
  const rpc = usePikkuRPC()
  const refresh = useRefreshGit()
  return useMutation({
    mutationFn: async (input: {
      message: string
      paths: string[]
    }): Promise<GitCommitResult> =>
      rpc.invoke('console:commitGitChanges', input),
    onSuccess: refresh,
  })
}

export function usePullChanges() {
  const rpc = usePikkuRPC()
  const refresh = useRefreshGit()
  return useMutation({
    mutationFn: () => rpc.invoke('console:pullGitChanges'),
    onSuccess: refresh,
  })
}

export function usePushChanges() {
  const rpc = usePikkuRPC()
  const refresh = useRefreshGit()
  return useMutation({
    mutationFn: () => rpc.invoke('console:pushGitChanges'),
    onSuccess: refresh,
  })
}

export const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error ?? '')

/** A status error that means the project folder is not under version control. */
export const isNotARepo = (error: unknown): boolean =>
  /not a git repository/i.test(errorText(error))
