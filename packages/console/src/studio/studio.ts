import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getServerUrl, setServerUrl } from '../context/serverUrl'

declare global {
  interface Window {
    __PIKKU_STUDIO__?: object
  }
}

export const isStudio = () => typeof window !== 'undefined' && !!window.__PIKKU_STUDIO__

export type ProjectLocation = 'local' | 'cloud' | 'both'

export interface StudioProject {
  key: string
  name: string
  location: ProjectLocation
  path: string | null
  fabricProjectId: string | null
  gitRepoUrl: string | null
  current: boolean
  missing: boolean
  open: boolean
}

export type AiChoice =
  | { kind: 'key'; provider: string; model: string }
  | { kind: 'subscription'; provider: string }
  | { kind: 'fabric' }

export interface AiOptions {
  keys: { id: string; name: string; envVar: string; model: string }[]
  subscriptions: { id: string; name: string; piLogin: string }[]
}

export interface StudioAccount {
  signIn: 'local' | 'fabric' | null
  ai: AiChoice | null
  signedIn: boolean
  apiUrl: string
  consoleUrl: string
}

export async function studioCall<T>(name: string, input: unknown = {}): Promise<T> {
  const res = await fetch(`${window.location.origin}/studio/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? res.statusText)
  return body as T
}

export const openProjectKey = (): string | null => {
  const prefix = `${window.location.origin}/p/`
  const url = getServerUrl()
  return url.startsWith(prefix) ? url.slice(prefix.length).split('/')[0] || null : null
}

const consoleBase = () => (import.meta.env.BASE_URL ?? '/console/').replace(/\/?$/, '/')

export const enterProject = (key: string, page = 'overview') => {
  setServerUrl(`${window.location.origin}/p/${key}`)
  window.location.assign(`${consoleBase()}${page}`)
}

export const leaveProject = () => {
  setServerUrl(window.location.origin)
  window.location.assign(consoleBase())
}

const ACCOUNT = ['studio', 'account']
const PROJECTS = ['studio', 'projects']

export const useStudioAccount = () =>
  useQuery({ queryKey: ACCOUNT, queryFn: () => studioCall<StudioAccount>('account') })

export const useStudioProjects = (enabled = true) =>
  useQuery({
    queryKey: PROJECTS,
    queryFn: async () => (await studioCall<{ projects: StudioProject[] }>('listProjects')).projects,
    enabled,
  })

export const useStudioAction = <I, O>(name: string) => {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: I) => studioCall<O>(name, input),
    onSuccess: () => client.invalidateQueries({ queryKey: ['studio'] }),
  })
}

export const useAiOptions = () =>
  useQuery({ queryKey: ['studio', 'ai-options'], queryFn: () => studioCall<AiOptions>('aiOptions'), staleTime: Infinity })
