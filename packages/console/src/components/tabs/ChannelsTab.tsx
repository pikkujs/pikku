import React, { Suspense } from 'react'
import { Center, Loader } from '@pikku/mantine/core'
import { ChannelTabContent } from './ChannelTabContent'

type ChannelsTabProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const ChannelsTab: React.FC<ChannelsTabProps> = ({
  searchQuery,
  emptyHero,
}) => {
  return (
    <Suspense
      fallback={
        <Center h="100%">
          <Loader />
        </Center>
      }
    >
      <ChannelTabContent searchQuery={searchQuery} emptyHero={emptyHero} />
    </Suspense>
  )
}
