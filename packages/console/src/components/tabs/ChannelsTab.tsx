import React, { Suspense } from 'react'
import { ChannelTabContent } from './ChannelTabContent'
import { ConsoleLoading } from '../ui/ConsoleLoading'

type ChannelsTabProps = { searchQuery: string; emptyHero?: React.ReactNode }

export const ChannelsTab: React.FC<ChannelsTabProps> = ({
  searchQuery,
  emptyHero,
}) => {
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <ChannelTabContent searchQuery={searchQuery} emptyHero={emptyHero} />
    </Suspense>
  )
}
