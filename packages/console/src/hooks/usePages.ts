import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import type { FlattenedRPCMap } from '../pikku/rpc-map.gen.d'

export type AppPage =
  FlattenedRPCMap['console:getPages']['output']['pages'][number]

export type PageShot =
  FlattenedRPCMap['console:screenshotPages']['output']['shots'][number] & {
    takenAt: number
  }

export type PageShots = Record<string, PageShot>

const PAGES_KEY = ['console:getPages']
const SHOTS_KEY = ['console:screenshotPages', 'shots']
const ADDRESS_KEY = 'pikku-console:pages:address'
const BUILTIN_PARAMS: Record<string, string> = { lang: 'en', locale: 'en' }

export const pageKey = (page: AppPage) => `${page.app}:${page.path}`

/** A route path with its params filled in, or null while a segment is still dynamic. */
export const fillPagePath = (
  path: string,
  params: Record<string, string> = {}
): string | null => {
  const values = { ...BUILTIN_PARAMS, ...params }
  const filled = path
    .split('/')
    .map((segment) => {
      const optional = /^\{-\$(.+)\}$/.exec(segment)
      if (optional) return values[optional[1]!] ?? ''
      const name = segment.startsWith('$') ? segment.slice(1) : null
      return name && values[name] ? values[name]! : segment
    })
    .filter((segment, i) => i === 0 || segment)
    .join('/')
  if (/[$*{]/.test(filled)) return null
  return filled || '/'
}

export const pageNeedsExample = (page: AppPage) =>
  fillPagePath(page.path) === null

export function usePages() {
  const rpc = usePikkuRPC()
  return useQuery({
    queryKey: PAGES_KEY,
    queryFn: async () => (await rpc.invoke('console:getPages', {})).pages,
  })
}

export function usePageShots(): PageShots {
  const queryClient = useQueryClient()
  const { data } = useQuery({
    queryKey: SHOTS_KEY,
    queryFn: () => queryClient.getQueryData<PageShots>(SHOTS_KEY) ?? {},
    initialData: {} as PageShots,
    staleTime: Infinity,
    gcTime: Infinity,
  })
  return data
}

export function useTakePictures() {
  const rpc = usePikkuRPC()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      baseUrl,
      app,
      pages,
      params,
      only,
    }: {
      baseUrl: string
      app: string
      pages: AppPage[]
      params?: Record<string, string>
      only?: boolean
    }) => {
      const paths = only
        ? pages.flatMap((page) => fillPagePath(page.path, params) ?? [])
        : undefined
      const result = await rpc.invoke('console:screenshotPages', {
        baseUrl,
        app,
        viewport: true,
        ...(paths ? { paths } : {}),
        ...(params ? { params } : {}),
      })
      return { result, pages, params }
    },
    onSuccess: ({ result, pages, params }) => {
      const takenAt = Date.now()
      const next: PageShots = {}
      for (const page of pages) {
        const path = fillPagePath(page.path, params)
        const shot = result.shots.find((s) => s.path === path)
        if (shot) next[pageKey(page)] = { ...shot, takenAt }
      }
      queryClient.setQueryData<PageShots>(SHOTS_KEY, (old) => ({
        ...old,
        ...next,
      }))
    },
  })
}

const readAddress = () => {
  try {
    return localStorage.getItem(ADDRESS_KEY) ?? ''
  } catch {
    return ''
  }
}

export function useAppAddress(): [string, (address: string) => void] {
  const [address, setAddress] = useState(readAddress)
  return [
    address,
    (next: string) => {
      setAddress(next)
      try {
        localStorage.setItem(ADDRESS_KEY, next)
      } catch {
        return
      }
    },
  ]
}
