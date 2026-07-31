import React from 'react'
import { FeatureNavigator } from './FeatureNavigator'
import type { ScenariosBrowse } from '../../hooks/useScenariosBrowse'

export interface ScenariosBrowseRailProps {
  browse: ScenariosBrowse
}

/**
 * The scenarios feature list, mountable on its own. `ScenariosPage` renders this
 * as its own drawer unless it is given the same `useScenariosBrowse()` state, in
 * which case the host owns where the rail lives — a side panel, a sheet — and
 * the page drops its copy.
 */
export const ScenariosBrowseRail: React.FC<ScenariosBrowseRailProps> = ({
  browse,
}) => (
  <FeatureNavigator
    features={browse.features}
    selectedId={browse.selected?.id}
    onSelect={browse.setSelectedId}
  />
)
