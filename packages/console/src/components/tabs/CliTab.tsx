import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { CliPageClient } from '../pages/CliPageClient'

export const CliTab: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <CliPageClient />
    </Suspense>
  )
}
