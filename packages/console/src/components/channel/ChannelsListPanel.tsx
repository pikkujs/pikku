import React, { useEffect } from 'react'
import { useSearchParams } from '../../router'
import { useUrlHash } from '../../hooks/useUrlHash'
import { encodePanelHash } from '../../lib/panel-url'
import { formatChannelRoute, parseChannelRoute } from './channel-selection'
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
}

/**
 * Every channel in the project as a card of the messages it handles.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta and keeps the
 * open row in the address fragment.
 */
export const ChannelsListPanel: React.FC<ChannelsListPanelProps> = ({
  searchQuery = '',
  emptyHero,
}) => {
  const [hash, setHash] = useUrlHash()
  const [searchParams] = useSearchParams()
  const { meta } = usePikkuMeta()
  useLocale()

  // `?id=` is where the open channel used to live; still read so links written
  // before it moved into the fragment keep working.
  const route = parseChannelRoute(hash)
  const legacyId = searchParams.get('id')
  const allChannelsMeta = meta.channelsMeta || {}
  const focus = route ?? (legacyId ? { channelName: legacyId, selected: null } : null)

  useEffect(() => {
    if (!route) return
    const canonical =
      encodePanelHash('channel', formatChannelRoute(route), true) ?? ''
    if (canonical !== hash) setHash(canonical)
  }, [route, hash, setHash])

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
      focus={focus}
      onSelect={(channelName, selected) =>
        setHash(
          encodePanelHash(
            'channel',
            formatChannelRoute({ channelName, selected }),
            true
          ) ?? ''
        )
      }
    />
  )
}
