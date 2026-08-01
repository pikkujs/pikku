import React, { Suspense } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { VirtualUsersWorkspace } from '../components/virtual-users/VirtualUsersWorkspace'

/**
 * Virtual users sit beside scenarios because they are fed by the same prose: a
 * scenario proves a path someone thought of, a virtual user works the same
 * ground without the script, which is where the rest of the bugs are.
 */
const VirtualUsersPageInner: React.FC = () => {
  useLocale()

  return (
    <ConsoleSurface>
      <VirtualUsersWorkspace />
    </ConsoleSurface>
  )
}

export const VirtualUsersPage: React.FC = () => (
  <Suspense
    fallback={
      <Center h="100vh">
        <Loader />
      </Center>
    }
  >
    <VirtualUsersPageInner />
  </Suspense>
)
