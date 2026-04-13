import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { ChannelPageClient } from '../pages/ChannelPageClient'

export const ChannelsTab: React.FunctionComponent = () => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <ChannelPageClient />
    </Suspense>
  )
}
