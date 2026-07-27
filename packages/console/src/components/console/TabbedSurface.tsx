import React, { useState } from 'react'
import { Group, SegmentedControl, Stack, TextInput } from '@pikku/mantine/core'
import { Search } from 'lucide-react'
import type { I18nNode, I18nString } from '@pikku/react'
import { useSearchParams } from '../../router'
import { ConsoleSurface } from './ConsoleSurface'
import { ResizablePanelLayout } from '../layout/ResizablePanelLayout'
import { ListPageHeader } from '../layout/PageLayout'
import { useLocale } from '@/i18n/config'

export interface TabbedSurfaceTab<L extends React.ReactNode = React.ReactNode> {
  value: string
  label: L
  /**
   * Placeholder for the shared search box. Omit on every tab of a surface that
   * has no search at all — the field is only rendered when the active tab
   * supplies one.
   */
  searchPlaceholder?: I18nString
  /** Hide the inspector while this tab is active. */
  hidePanel?: boolean
  render: (searchQuery: string) => React.ReactNode
}

interface TabbedSurfaceBaseProps {
  title: I18nNode
  description?: I18nNode
  docsHref?: string
  emptyPanelMessage?: I18nNode
  /** Inline width of the search field in px. */
  searchWidth?: number
  /** Search param the uncontrolled tab state reads and writes (default `tab`). */
  searchParamKey?: string
  /** Controlled tab value. Falls back to the search param when omitted. */
  activeTab?: string
  /** Controlled tab setter. Falls back to writing the search param when omitted. */
  onTabChange?: (value: string) => void
}

/**
 * Where the tab switch and search live:
 * - `shell` — ShellHeader's measured, collapsing `search`/`selection` controls.
 * - `inline` — a raw search box + `SegmentedControl` in the header's filters slot.
 * - `stacked` — a `SegmentedControl` below the header bar, no search.
 */
export type TabbedSurfaceProps = TabbedSurfaceBaseProps &
  (
    | {
        controls: 'shell'
        tabAriaLabel: I18nString
        tabs: TabbedSurfaceTab<I18nString>[]
      }
    | {
        controls?: 'inline' | 'stacked'
        tabAriaLabel?: undefined
        tabs: TabbedSurfaceTab[]
      }
  )

/**
 * The tab-router shell every list surface with sub-tabs is built from: a panel
 * context, a header carrying the tab switch (and, where the tabs ask for one, a
 * search box), and the active tab's body beside the inspector.
 *
 * Tab state is uncontrolled by default and lives in a search param, which is
 * what the OSS console relies on. A host with its own router passes `activeTab`
 * and `onTabChange` to drive the tabs itself.
 */
export const TabbedSurface: React.FC<TabbedSurfaceProps> = (props) => {
  const {
    tabs,
    title,
    description,
    docsHref,
    emptyPanelMessage,
    searchWidth = 240,
    searchParamKey = 'tab',
    activeTab,
    onTabChange,
  } = props
  useLocale()
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')

  const requested = activeTab ?? searchParams.get(searchParamKey)
  const active = tabs.find((tab) => tab.value === requested) ?? tabs[0]!

  const handleTabChange = (value: string) => {
    setSearchQuery('')
    if (onTabChange) {
      onTabChange(value)
      return
    }
    setSearchParams({ [searchParamKey]: value })
  }

  const segmented = (
    <SegmentedControl
      size="xs"
      value={active.value}
      onChange={handleTabChange}
      data={tabs.map(({ value, label }) => ({ value, label }))}
    />
  )

  let header: React.ReactNode
  if (props.controls === 'shell') {
    header = (
      <ListPageHeader
        title={title}
        description={description}
        docsHref={docsHref}
        search={
          active.searchPlaceholder
            ? {
                placeholder: active.searchPlaceholder,
                value: searchQuery,
                onChange: setSearchQuery,
                width: searchWidth,
              }
            : undefined
        }
        selection={{
          ariaLabel: props.tabAriaLabel,
          value: active.value,
          onChange: handleTabChange,
          options: props.tabs.map(({ value, label }) => ({ value, label })),
        }}
      />
    )
  } else if (props.controls === 'stacked') {
    header = (
      <Stack gap="md">
        <ListPageHeader
          title={title}
          description={description}
          docsHref={docsHref}
        />
        {segmented}
      </Stack>
    )
  } else {
    header = (
      <ListPageHeader
        title={title}
        description={description}
        docsHref={docsHref}
        filters={
          <Group gap="sm" wrap="nowrap">
            {active.searchPlaceholder && (
              <TextInput
                placeholder={active.searchPlaceholder}
                leftSection={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                size="xs"
                style={{ width: searchWidth }}
              />
            )}
            {segmented}
          </Group>
        }
      />
    )
  }

  return (
    <ConsoleSurface>
      <ResizablePanelLayout
        header={header}
        emptyPanelMessage={emptyPanelMessage}
        hidePanel={active.hidePanel ?? false}
      >
        {active.render(searchQuery)}
      </ResizablePanelLayout>
    </ConsoleSurface>
  )
}
