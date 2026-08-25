import React, { Suspense } from 'react'
import { CliTabContent } from './CliTabContent'
import { ConsoleLoading } from '../ui/ConsoleLoading'

type CliTabProps = { searchQuery: string }

export const CliTab: React.FC<CliTabProps> = ({ searchQuery }) => {
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <CliTabContent searchQuery={searchQuery} />
    </Suspense>
  )
}
