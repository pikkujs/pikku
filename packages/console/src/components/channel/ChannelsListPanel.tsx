import React from 'react'
import { useSearchParams } from '../../router'
import { useUrlHash } from '../../hooks/useUrlHash'
import { parseChannelRoute } from './channel-selection'
import { Radio } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { ChannelCards } from './ChannelCards'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface ChannelsListPanelProps {
  /** Filters the channels; the screen above owns the search box. */
  searchQuery?: string
  emptyHero?: React.ReactNode
  selectedName?: string
}

/**
 * Every channel in the project as a card of the messages it handles.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta and keeps the
 * open row in the address fragment.
 */
export const ChannelsListPanel: React.FC<ChannelsListPanelProps> = ({
  searchQuery = '',
  emptyHero,
  selectedName,
}) => {
  const [hash] = useUrlHash()
  const [searchParams] = useSearchParams()
  const { meta } = usePikkuMeta()
  useLocale()

  const allChannelsMeta = meta.channelsMeta || {}
  const focusName =
    parseChannelRoute(hash)?.channelName ?? searchParams.get('id')

  if (Object.keys(allChannelsMeta).length === 0) {
    return (
      <EmptyStatePlaceholder
        icon={Radio}
        hero={emptyHero}
        title={m.wires_channels_empty_title()}
        description={m.wires_channels_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/channels"
      />
    )
  }

  return (
    <ChannelCards
      channels={allChannelsMeta}
      searchQuery={searchQuery}
      focusName={focusName}
      selectedName={selectedName}
    />
  )
}
