import React, { useEffect } from 'react'
import { useSearchParams } from '../../router'
import { useUrlHash } from '../../hooks/useUrlHash'
import { encodePanelHash } from '../../lib/panel-url'
import { formatChannelRoute, parseChannelRoute } from './channel-selection'
import { Radio } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import { ChannelWorkspace } from './ChannelWorkspace'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

export interface ChannelsListPanelProps {
  /** Filters the handler tree; the screen above owns the search box. */
  searchQuery?: string
  emptyHero?: React.ReactNode
}

/**
 * Every channel in the project as a navigable handler tree beside its detail.
 * Mount anywhere under a `ConsoleSurface` — it reads its own meta and keeps the
 * open channel in the address fragment.
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
  const channelName =
    parseChannelRoute(hash)?.channelName || searchParams.get('id') || ''
  const allChannelsMeta = meta.channelsMeta || {}
  const channelNames = Object.keys(allChannelsMeta)
  const resolvedName = channelName || channelNames[0] || ''
  const channelMeta = allChannelsMeta[resolvedName]

  // The screen opens on the first channel when nothing names one, and a link
  // from another page arrives type-qualified. Either way the fragment is
  // rewritten to what this panel writes itself, so the address always describes
  // the screen.
  useEffect(() => {
    if (!channelMeta) return
    const canonical =
      encodePanelHash(
        'channel',
        formatChannelRoute({
          channelName: resolvedName,
          selected: parseChannelRoute(hash)?.selected ?? null,
        }),
        true
      ) ?? ''
    if (canonical !== hash) setHash(canonical)
  }, [channelMeta, hash, resolvedName, setHash])

  if (!channelMeta) {
    return (
      <EmptyStatePlaceholder
        icon={Radio}
        hero={emptyHero}
        title={m.channels_empty_title()}
        description={m.channels_empty_description()}
        docsHref="https://pikku.dev/docs/core-features/channels"
      />
    )
  }

  return (
    <ChannelWorkspace
      channelName={resolvedName}
      channelMeta={channelMeta}
      allChannelsMeta={allChannelsMeta}
      searchQuery={searchQuery}
    />
  )
}
