import React from 'react'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { CredentialsWorkspace } from '../components/credentials/CredentialsWorkspace'

export const CredentialsPage: React.FC<{ emptyHero?: React.ReactNode }> = ({
  emptyHero,
}) => (
  <ConsoleSurface>
    <CredentialsWorkspace emptyHero={emptyHero} />
  </ConsoleSurface>
)
