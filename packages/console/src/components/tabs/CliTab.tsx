import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { CliTabContent } from './CliTabContent'

type CliTabProps = { searchQuery: string }

export const CliTab: React.FC<CliTabProps> = ({ searchQuery }) => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <CliTabContent searchQuery={searchQuery} />
    </Suspense>
  )
}
