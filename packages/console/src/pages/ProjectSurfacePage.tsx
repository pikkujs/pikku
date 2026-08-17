import React from 'react'
import { SurfacePage } from './SurfacePage'
import { useSurface } from '../hooks/useSurface'

/**
 * `SurfacePage` on the project's own data. It stays separate so the page itself
 * keeps taking the doc as a prop and the website can mount it with a released
 * version's doc and no console to ask.
 */
export const ProjectSurfacePage: React.FC = () => {
  const { doc, usage, loading } = useSurface()

  return <SurfacePage doc={doc} usage={usage} loading={loading} />
}
