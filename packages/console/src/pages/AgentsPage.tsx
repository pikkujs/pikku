import React from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from '../router'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { AgentsWorkspace } from '../components/agents/AgentsWorkspace'

export interface AgentExtraColumn {
  label: string
  width?: string
  render: (name: string) => React.ReactNode
}

export const AgentsPage: React.FC<{
  onOpen?: (name: string) => void
  headerRight?: ReactNode
  emptyHero?: ReactNode
  metricSlot?: (name: string) => ReactNode
}> = ({ onOpen, headerRight, emptyHero, metricSlot }) => {
  const navigate = useNavigate()
  const handleOpen = (name: string) => {
    if (onOpen) {
      onOpen(name)
    } else {
      navigate(`/agents/playground?id=${encodeURIComponent(name)}`)
    }
  }
  return (
    <ConsoleSurface>
      <AgentsWorkspace
        onOpen={handleOpen}
        headerRight={headerRight}
        emptyHero={emptyHero}
        metricSlot={metricSlot}
      />
    </ConsoleSurface>
  )
}
