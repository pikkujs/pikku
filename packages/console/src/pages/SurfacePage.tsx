import React from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { SurfaceWorkspace } from '../components/surface/SurfaceWorkspace'
import type { SurfaceWorkspaceProps } from '../components/surface/SurfaceWorkspace'

/**
 * The public surface page. The doc and the measured usage are supplied rather
 * than fetched here, so the same page serves the website — which has the doc for
 * a released version and can measure nothing — and the console, which has both.
 */
export const SurfacePage: React.FC<SurfaceWorkspaceProps> = (props) => (
  <ConsoleSurface>
    <SurfaceWorkspace {...props} />
  </ConsoleSurface>
)
