import React from 'react'
import { CategoryRail } from './CategoryRail'
import type { PackagesBrowse } from '../../hooks/usePackagesBrowse'

export interface PackagesBrowseRailProps {
  browse: PackagesBrowse
  /** Drop the "Browse" heading when the host's own panel header already says it. */
  withHeading?: boolean
}

/**
 * The package gallery's category rail, mountable on its own. `PackagesListPanel`
 * renders this inline unless it is given the same `usePackagesBrowse()` state,
 * in which case the host owns where the rail lives — a side panel, a sheet — and
 * the panel drops its copy.
 */
export const PackagesBrowseRail: React.FC<PackagesBrowseRailProps> = ({
  browse,
  withHeading,
}) => (
  <CategoryRail
    categories={browse.categories}
    active={browse.category}
    total={browse.catalogueTotal}
    onPick={browse.setCategory}
    withHeading={withHeading}
  />
)
