import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { CliTabContent } from './CliTabContent'

export const CliTab: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <CliTabContent />
    </Suspense>
  )
}
