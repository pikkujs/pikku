import React, { Suspense } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { useLocale } from '@/i18n/config'
import { ConsoleSurface } from '../components/console/ConsoleSurface'
import { PersonasWorkspace } from '../components/personas/PersonasWorkspace'

/**
 * The people a product is for, declared once with `definePersonas()`.
 *
 * A page of its own because the declaration outgrew the screen it started on:
 * a persona is a scenario's cast, a virtual user's identity and a knowledge
 * resource, and reading it under any one of those makes the other two look like
 * they keep their own list.
 */
const PersonasPageInner: React.FC = () => {
  useLocale()

  return (
    <ConsoleSurface>
      <PersonasWorkspace />
    </ConsoleSurface>
  )
}

export const PersonasPage: React.FC = () => (
  <Suspense
    fallback={
      <Center h="100vh">
        <Loader />
      </Center>
    }
  >
    <PersonasPageInner />
  </Suspense>
)
