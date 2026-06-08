import React, { Suspense } from 'react'
import { Center, Loader } from '@mantine/core'
import { ChannelTabContent } from './ChannelTabContent'

type ChannelsTabProps = { searchQuery: string }

export const ChannelsTab: React.FC<ChannelsTabProps> = ({ searchQuery }) => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <ChannelTabContent searchQuery={searchQuery} />
    </Suspense>
  )
}
