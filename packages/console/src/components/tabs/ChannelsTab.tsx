import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { ChannelTabContent } from './ChannelTabContent'

export const ChannelsTab: React.FC = () => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <ChannelTabContent />
    </Suspense>
  )
}
