import React, { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from '../../router'
import { useUrlHash } from '../../hooks/useUrlHash'
import { encodePanelHash } from '../../lib/panel-url'
import {
  formatChannelRoute,
  parseChannelRoute,
} from '../channel/channel-selection'
import { Radio } from 'lucide-react'
import { EmptyStatePlaceholder } from '../layout/EmptyStatePlaceholder'
import { ConsoleSurface } from '../console/ConsoleSurface'
import { usePikkuMeta } from '../../context/PikkuMetaContext'
import {
  ChannelNavTree,
  type ChannelSelection,
} from '../channel/ChannelNavTree'
import { ChannelDetailView } from '../channel/ChannelDetailView'
import { ListDetailLayout } from '../ui/ListDetailLayout'
import type { ChannelMeta } from '@pikku/core/channel'
import { m } from '@/i18n/messages'
import { useLocale } from '@/i18n/config'

const ChannelTabInner: React.FC<{
  channelName: string
  channelMeta: ChannelMeta
  allChannelsMeta: Record<string, ChannelMeta>
  searchQuery: string
}> = ({ channelName, channelMeta, allChannelsMeta, searchQuery }) => {
  const [hash, setHash] = useUrlHash()

  const selected = useMemo(
    () => parseChannelRoute(hash)?.selected ?? null,
    [hash]
  )

  const writeRoute = useCallback(
    (name: string, next: ChannelSelection) => {
      setHash(
        encodePanelHash(
          'channel',
          formatChannelRoute({ channelName: name, selected: next }),
          true
        ) ?? ''
      )
    },
    [setHash]
  )

  const handleSelect = useCallback(
    (next: ChannelSelection) => writeRoute(channelName, next),
    [channelName, writeRoute]
  )

  // Switching channel drops the handler selected in the old one — the fragment
  // names a row inside a channel, and that row does not exist in the next.
  const handleChannelSwitch = useCallback(
    (name: string) => writeRoute(name, null),
    [writeRoute]
  )

  return (
    <ListDetailLayout
      listWidth={320}
      list={
        <ChannelNavTree
          channelName={channelName}
          channel={channelMeta}
          allChannelsMeta={allChannelsMeta}
          selected={selected}
          onSelect={handleSelect}
          onChannelSwitch={handleChannelSwitch}
          searchQuery={searchQuery}
        />
      }
      detail={
        <ChannelDetailView
          channelName={channelName}
          channel={channelMeta}
          selected={selected}
        />
      }
      hasSelection={true}
    />
  )
}

type ChannelTabContentProps = {
  searchQuery: string
  emptyHero?: React.ReactNode
}

export const ChannelTabContent: React.FC<ChannelTabContentProps> = ({
  searchQuery,
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

  // The tab opens on the first channel when nothing names one, and a link from
  // another page arrives type-qualified. Either way the fragment is rewritten
  // to what this page writes itself, so the address always describes the screen.
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
    <ConsoleSurface>
      <ChannelTabInner
        channelName={resolvedName}
        channelMeta={channelMeta}
        allChannelsMeta={allChannelsMeta}
        searchQuery={searchQuery}
      />
    </ConsoleSurface>
  )
}
