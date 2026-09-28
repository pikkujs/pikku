import { useCallback, useMemo } from 'react'
import type { ChannelMeta } from '@pikku/core/channel'
import { useSearchParams } from '../router'
import { usePikkuMeta } from '../context/PikkuMetaContext'

export const ALL_CHANNELS = '__all__'

export interface ChannelsBrowse {
  channels: Record<string, ChannelMeta>
  selectedName: string
  setSelectedName: (name: string) => void
  selected: string | undefined
}

export const useChannelsBrowse = (): ChannelsBrowse => {
  const [searchParams, setSearchParams] = useSearchParams()
  const { meta } = usePikkuMeta()
  const channels = useMemo(() => meta.channelsMeta || {}, [meta.channelsMeta])
  const param = searchParams.get('channel')
  const selected = param && channels[param] ? param : undefined

  const setSelectedName = useCallback(
    (name: string) =>
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (name === ALL_CHANNELS) next.delete('channel')
          else next.set('channel', name)
          return next
        },
        { replace: true }
      ),
    [setSearchParams]
  )

  return {
    channels,
    selectedName: selected ?? ALL_CHANNELS,
    setSelectedName,
    selected,
  }
}
