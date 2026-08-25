import React, { Suspense } from 'react'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { VirtualUsersWorkspace } from '../components/virtual-users/VirtualUsersWorkspace'
import { ConsoleLoading } from '../components/ui/ConsoleLoading'

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
  <Suspense fallback={<ConsoleLoading h="100vh" />}>
    <VirtualUsersPageInner />
  </Suspense>
)
