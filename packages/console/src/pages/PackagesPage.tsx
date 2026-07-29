import React from 'react'
import { useSearchParams } from '../router'
import { PackageDetailPage } from './PackageDetailPage'
import { PackagesListPanel } from '../components/packages/PackagesListPanel'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import type { PackagesBrowse } from '../hooks/usePackagesBrowse'

// `emptyHero` is accepted for backwards compat with the fabric console shell
// but no longer used — the addons tab always renders its own gallery/empty state.
export const PackagesPage: React.FC<{
  emptyHero?: React.ReactNode
  /** Forwarded to `PackagesListPanel` — see its `browse` prop. */
  browse?: PackagesBrowse
}> = ({ browse }) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const source = (searchParams.get('source') ?? 'community') as
    'installed' | 'community' | 'api'

  return (
    <ConsoleSurface>
      {selectedId ? (
        <PackageDetailPage
          id={selectedId}
          source={source}
          onBack={() => setSearchParams({})}
        />
      ) : (
        <PackagesListPanel
          browse={browse}
          onSelect={(id, src) => setSearchParams({ id, source: src })}
        />
      )}
    </ConsoleSurface>
  )
}
