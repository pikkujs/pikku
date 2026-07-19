import React, { useMemo, useState } from 'react'
import { useSearchParams } from '../router'
import { PackageDetailPage } from './PackageDetailPage'
import {
  Group,
  TextInput,
  SegmentedControl,
  Box,
  Center,
  Loader,
} from '@pikku/mantine/core'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'
import { Package, Globe, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usePikkuRPC } from '../context/PikkuRpcProvider'
import { useConsoleEditable } from '../context/ConsoleEditableContext'
import { ResizablePanelLayout } from '../components/layout/ResizablePanelLayout'
import { ListPageHeader } from '../components/layout/PageLayout'
import { EmptyStatePlaceholder } from '../components/layout/EmptyStatePlaceholder'
import { CommunityGallery } from '../components/packages/CommunityGallery'
import { isOfficialAddon } from '../components/packages/addonCategoryMeta'
import { deriveNamespace } from '../components/packages/deriveNamespace'
import { PanelProvider } from '../context/PanelContext'

type AddonFilter = 'all' | 'official' | 'installed'

export interface PackageMeta {
  id: string
  name: string
  displayName: string
  description: string
  version: string
  author: string
  icon?: string
  tags: string[]
  categories: string[]
  functions: Record<string, unknown>
  agents: Record<string, unknown>
  // API-only fields (populated when this entry came from the OpenAPI catalogue,
  // via apiToPackageMeta below) — undefined for regular addons.
  swaggerUrl?: string
  totalOperations?: number
}

// A locally-wired addon as reported by console:getInstalledAddons. It may not
// exist in the remote catalogue at all (e.g. a private or first-party addon
// that was never published to the gallery).
interface InstalledAddonRow {
  namespace: string
  packageName: string
  functionCount: number
  agentCount: number
  icon?: string
  tags?: string[]
}

// Synthesise a gallery card for an installed addon that has no catalogue entry,
// so the Installed view can still list it (name/version/description come from
// the catalogue when available, otherwise we show what getInstalledAddons knows).
const installedToPackageMeta = (a: InstalledAddonRow): PackageMeta => ({
  id: a.packageName,
  name: a.packageName,
  displayName: a.namespace || a.packageName,
  description: '',
  version: '',
  author: '',
  icon: a.icon,
  tags: a.tags ?? [],
  categories: [],
  functions: {},
  agents: {},
})

const AddonsList: React.FC<{
  searchQuery: string
  filter: AddonFilter
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ searchQuery, filter, onSelect }) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getAddonMeta')
      return ((result as any)?.packages ?? result ?? []) as PackageMeta[]
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: installedAddons } = useQuery<InstalledAddonRow[]>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddonRow[]
    },
    staleTime: 60 * 1000,
  })

  const installMutation = useMutation({
    mutationFn: async ({
      addon,
      namespace,
    }: {
      addon: PackageMeta
      namespace?: string
    }) =>
      rpc.invoke('console:installAddon', {
        packageName: addon.name,
        namespace: namespace?.trim() || deriveNamespace(addon.name),
        version: addon.version,
      }),
    onSuccess: (_result, { addon }) => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
      // Land the user on the freshly installed addon's setup surface so they
      // can immediately connect its integrations / set its secrets.
      onSelect(addon.name, 'installed')
    },
  })

  const installedNames = useMemo(
    () => new Set((installedAddons ?? []).map((a) => a.packageName)),
    [installedAddons]
  )

  // packageName → the wireAddon names it's installed under, so the drawer can
  // show existing instances (the same package can be wired several times).
  const installedNamespaces = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const a of installedAddons ?? []) {
      ;(map[a.packageName] ??= []).push(a.namespace)
    }
    return map
  }, [installedAddons])

  // All | Official | Installed narrows the same catalogue in place: 'official' =
  // first-party Pikku packages, 'all' = the full gallery. 'installed' is a
  // left-join on what the project has actually wired, NOT an intersection with
  // the catalogue — a local or unpublished addon (e.g. a private first-party
  // one) is installed but absent from `data`, so intersecting would hide it.
  // Use the catalogue entry when present, synthesise a minimal card otherwise.
  const visible = useMemo(() => {
    const list = data ?? []
    if (filter === 'installed') {
      const catalogByName = new Map(list.map((a) => [a.name, a]))
      return (installedAddons ?? []).map(
        (a) => catalogByName.get(a.packageName) ?? installedToPackageMeta(a)
      )
    }
    if (filter === 'official')
      return list.filter((a) => isOfficialAddon(a.name))
    return list
  }, [data, filter, installedAddons])

  if (isLoading) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  if (!data || data.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Package}
        title={m.packages_registry_unavailable_title()}
        description={m.packages_registry_unavailable_description()}
        docsHref="https://pikku.dev/docs/external-packages"
      />
    )
  }

  return (
    <CommunityGallery
      addons={visible}
      searchQuery={searchQuery}
      installedNames={installedNames}
      installedNamespaces={installedNamespaces}
      editable={editable}
      installingName={
        installMutation.isPending
          ? (installMutation.variables?.addon.name ?? null)
          : null
      }
      actionError={
        installMutation.isError
          ? {
              name: installMutation.variables?.addon.name ?? '',
              message:
                installMutation.error instanceof Error
                  ? installMutation.error.message
                  : String(installMutation.error),
            }
          : null
      }
      onInstall={(addon, namespace) =>
        installMutation.mutate({ addon, namespace })
      }
      onOpenInstalled={(addon) => onSelect(addon.name, 'installed')}
    />
  )
}

interface OpenApiEntry {
  name: string
  version: string
  provider: string
  service: string | null
  title: string
  description: string
  openapiVer: string
  swaggerUrl: string
  logo?: string
  categories?: string[]
  tags?: string[]
  totalOperations?: number
}

// APIs render through the exact same gallery/card/drawer as addons — the only
// difference is the action verb (Import vs Add), handled via `kind` props.
// Mapping into PackageMeta is what makes that reuse possible.
const apiToPackageMeta = (item: OpenApiEntry): PackageMeta => ({
  id: item.name,
  name: item.name,
  displayName: item.title || item.name,
  description: item.description,
  version: item.version,
  author: item.provider,
  icon: item.logo ?? undefined,
  tags: item.tags ?? [],
  categories: item.categories ?? [],
  functions: {},
  agents: {},
  swaggerUrl: item.swaggerUrl,
  totalOperations: item.totalOperations,
})

const ApisList: React.FC<{ searchQuery: string }> = ({ searchQuery }) => {
  const rpc = usePikkuRPC()
  useLocale()
  const editable = useConsoleEditable()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['openapis'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getOpenapis', {
        limit: 100,
        offset: 0,
      })
      return result as { apis: OpenApiEntry[]; total: number }
    },
    staleTime: 60 * 1000,
    retry: false,
  })

  const { data: installedAddons } = useQuery<InstalledAddonRow[]>({
    queryKey: ['installed-addons'],
    queryFn: async () => {
      const result = await rpc.invoke('console:getInstalledAddons')
      return (result ?? []) as InstalledAddonRow[]
    },
    staleTime: 60 * 1000,
  })

  // installOpenapiAddon generates a local addon named @pikku/addon-<slug> and
  // wires it up — it shows up in getInstalledAddons like any other addon.
  const importMutation = useMutation({
    mutationFn: async (api: PackageMeta) =>
      rpc.invoke('console:installOpenapiAddon', {
        name: deriveNamespace(api.name),
        // apiToPackageMeta always sets swaggerUrl — this mutation only ever
        // receives API-kind PackageMeta objects from ApisList's onInstall.
        swaggerUrl: api.swaggerUrl!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['installed-addons'] })
      queryClient.invalidateQueries({ queryKey: ['allMeta'] })
    },
  })

  // installOpenapiAddon registers the generated addon under a DERIVED slug
  // (@pikku/addon-<slug>), not the catalogue's own name — map installed
  // slugs back to whichever catalogue entries produced them.
  const installedSlugs = useMemo(
    () =>
      new Set(
        (installedAddons ?? [])
          .filter((a) => a.packageName.startsWith('@pikku/addon-'))
          .map((a) => a.packageName.slice('@pikku/addon-'.length))
      ),
    [installedAddons]
  )

  const apis = useMemo(() => (data?.apis ?? []).map(apiToPackageMeta), [data])

  const installedNames = useMemo(
    () =>
      new Set(
        apis
          .filter((api) => installedSlugs.has(deriveNamespace(api.name)))
          .map((api) => api.name)
      ),
    [apis, installedSlugs]
  )

  if (isLoading) {
    return (
      <Box style={{ flex: 1, minHeight: 0 }}>
        <Center h="100%">
          <Loader />
        </Center>
      </Box>
    )
  }

  if (!data || data.apis.length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Globe}
        title={m.packages_no_apis_title()}
        description={m.packages_no_apis_description()}
        docsHref="https://pikku.dev/docs/external-packages"
      />
    )
  }

  return (
    <CommunityGallery
      addons={apis}
      searchQuery={searchQuery}
      installedNames={installedNames}
      editable={editable}
      kind="api"
      installingName={
        importMutation.isPending
          ? (importMutation.variables?.name ?? null)
          : null
      }
      actionError={
        importMutation.isError
          ? {
              name: importMutation.variables?.name ?? '',
              message:
                importMutation.error instanceof Error
                  ? importMutation.error.message
                  : String(importMutation.error),
            }
          : null
      }
      onInstall={(api) => importMutation.mutate(api)}
    />
  )
}

type MainTab = 'addons' | 'apis'

const PackagesList: React.FC<{
  onSelect: (id: string, source: 'installed' | 'community' | 'api') => void
}> = ({ onSelect }) => {
  const [tab, setTab] = useState<MainTab>('addons')
  const [filter, setFilter] = useState<AddonFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const editable = useConsoleEditable()
  useLocale()

  // A deployed stage is read-only: you can't install into it. Lock the addons
  // view to what's already wired and point people at a sandbox to add more.
  const effectiveFilter: AddonFilter = editable ? filter : 'installed'

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    setTab(value as MainTab)
  }

  const mainTabs = [
    { value: 'addons', label: m.packages_tab_addons() },
    { value: 'apis', label: m.packages_tab_apis() },
  ]
  const addonFilters = [
    { value: 'all', label: m.packages_filter_all() },
    { value: 'official', label: m.packages_filter_official() },
    { value: 'installed', label: m.packages_filter_installed() },
  ]

  return (
    <ResizablePanelLayout
      hidePanel
      header={
        <ListPageHeader
          title={m.packages_title()}
          description={m.packages_description()}
          docsHref="https://pikku.dev/docs/external-packages"
          filters={
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={
                  tab === 'apis'
                    ? m.packages_search_apis_placeholder()
                    : m.packages_search_addons_placeholder()
                }
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: 240 }}
              />
              {tab === 'addons' && editable && (
                <SegmentedControl
                  size="xs"
                  value={filter}
                  onChange={(v) => setFilter(v as AddonFilter)}
                  data={addonFilters}
                />
              )}
              <SegmentedControl
                size="xs"
                value={tab}
                onChange={handleTabChange}
                data={mainTabs}
              />
            </Group>
          }
        />
      }
    >
      {tab === 'apis' ? (
        <ApisList searchQuery={searchQuery} />
      ) : (
        <AddonsList
          searchQuery={searchQuery}
          filter={effectiveFilter}
          onSelect={onSelect}
        />
      )}
    </ResizablePanelLayout>
  )
}

const PackagesPageContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const source = (searchParams.get('source') ?? 'community') as
    | 'installed'
    | 'community'
    | 'api'

  if (selectedId) {
    return (
      <PackageDetailPage
        id={selectedId}
        source={source}
        onBack={() => setSearchParams({})}
      />
    )
  }

  return (
    <PackagesList
      onSelect={(id, src) => setSearchParams({ id, source: src })}
    />
  )
}

// `emptyHero` is accepted for backwards compat with the fabric console shell
// but no longer used — the addons tab always renders its own gallery/empty state.
export const PackagesPage: React.FC<{ emptyHero?: React.ReactNode }> = () => {
  return (
    <PanelProvider>
      <PackagesPageContent />
    </PanelProvider>
  )
}
