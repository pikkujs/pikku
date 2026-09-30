import React from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { RuntimeWorkspace } from '../components/runtime/RuntimeWorkspace'

export const RuntimePage: React.FC = () => (
  <ConsoleSurface>
    <RuntimeWorkspace />
  </ConsoleSurface>
)
