import { useMemo, useState } from 'react'
import { Text } from '@pikku/mantine/core'
import { WovenMark } from './WovenMark'
import { m } from '@/i18n/messages'
import { type I18nNode } from '@pikku/react'
import { PageContainer, PageHeader, PanelCard } from '../layout/PageLayout'
import { usePhone } from '../../lib/breakpoints'
import type { WeaveType, WeavePiece, WeaveLayout } from './types'
import { TYPES, KEYFRAMES, LAYOUT_KEY } from './internal'

import { WeaveDockedPanel } from './WeaveDockedPanel'

import { Field } from './Field'

import { WeaveFilterControls } from './WeaveFilterControls'
import { WeaveBar } from './WeaveBar'

export function WeavingBuildBody({
  pieces,
  loading,
  hot,
  title,
  showFilters = true,
  onOpenApp,
  building,
  openPage,
  initialLayout,
}: {
  pieces: WeavePiece[]
  loading: boolean
  hot: Map<string, number>
  title?: I18nNode
  showFilters?: boolean
  onOpenApp?: () => void
  building: boolean
  openPage?: (piece: WeavePiece) => void
  initialLayout?: WeaveLayout
}) {
  const phone = usePhone()
  const [typeFilter, setTypeFilter] = useState<WeaveType[]>([])
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [layout, setLayoutState] = useState<WeaveLayout>(() => {
    if (initialLayout) return initialLayout
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(LAYOUT_KEY) : null
    return saved === 'graph' ? 'graph' : 'radial'
  })
  const setLayout = (value: WeaveLayout) => {
    setLayoutState(value)
    try {
      localStorage.setItem(LAYOUT_KEY, value)
    } catch (e) {
      console.warn('WeavingBuild: could not persist layout preference', e)
    }
  }

  // Types actually present, in the canonical TYPES order — so the filter only ever
  // offers kinds the app has, and always lists them the same way.
  const availableTypes = useMemo(() => {
    const present = new Set(pieces.map((p) => p.type))
    return (Object.keys(TYPES) as WeaveType[]).filter((t) => present.has(t))
  }, [pieces])

  // Union of user tags across pieces (pikku built-ins are already filtered out).
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const p of pieces) {
      const t = p.meta.tags
      if (Array.isArray(t)) {
        for (const tag of t) {
          if (typeof tag === 'string' && !tag.startsWith('pikku')) tags.add(tag)
        }
      }
    }
    return [...tags].sort((a, b) => a.localeCompare(b))
  }, [pieces])

  const filtered = useMemo(() => {
    return pieces.filter((p) => {
      if (typeFilter.length && !typeFilter.includes(p.type)) return false
      if (tagFilter.length) {
        const t = Array.isArray(p.meta.tags) ? (p.meta.tags as unknown[]) : []
        if (!tagFilter.some((tag) => t.includes(tag))) return false
      }
      return true
    })
  }, [pieces, typeFilter, tagFilter])

  const controls = (
    <WeaveFilterControls
      types={availableTypes}
      tags={availableTags}
      typeFilter={typeFilter}
      onTypeFilter={setTypeFilter}
      tagFilter={tagFilter}
      onTagFilter={setTagFilter}
      layout={layout}
      onLayout={setLayout}
    />
  )

  const body = (
    <>
      <style>{KEYFRAMES}</style>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading && pieces.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <WovenMark variant="breathe" size={52} />
            <Text size="sm" c="var(--app-text-faint)">
              {m.weaving_preparing()}
            </Text>
          </div>
        ) : pieces.length === 0 ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <WovenMark variant="breathe" size={52} />
            <Text size="md" fw={700} c="var(--app-text)">
              {m.weaving_empty_title()}
            </Text>
            <Text size="sm" c="var(--app-text-faint)" style={{ maxWidth: 340 }}>
              {m.weaving_empty_subtitle()}
            </Text>
          </div>
        ) : (
          // Two stacked cards: the woven field, and (while building) the status
          // card — each a self-contained bordered card, with a gap between them.
          // Standalone screen: pad to the standard page gutter (PageContainer's
          // px/py='xl'). Embedded: no inner padding — fill the builder's preview
          // card exactly like the app iframe does (that card is already padded).
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              // Standalone: the field fills the whole card (the PageContainer card
              // is the frame), so no gutter. Embedded: also flush inside the
              // builder's preview card.
              padding: 0,
            }}
          >
            {/* Field, with the detail panel as a right-hand column. Standalone
                (title present) hoists that panel OUT to a sibling card beside the
                weave card (see the return below); embedded (header-less, inside
                the builder's small preview card) keeps it docked inline here. */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  position: 'relative',
                  overflow: 'hidden',
                  // Standalone: no inner frame — the field fills the card edge to
                  // edge (the card supplies the border/radius). Embedded: a framed
                  // preview tile inside the builder's preview card.
                  borderRadius: title ? 0 : 14,
                  border: title ? undefined : '0.5px solid var(--app-border)',
                  boxShadow: title ? undefined : 'var(--app-shadow-sm)',
                }}
              >
                <Field pieces={filtered} hot={hot} layout={layout} openPage={openPage} />
                {title || !showFilters ? null : (
                  <div
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      zIndex: 40,
                      padding: 6,
                      borderRadius: 12,
                      background: 'color-mix(in srgb, var(--app-panel-bg) 86%, transparent)',
                      border: '0.5px solid var(--app-border)',
                      boxShadow: 'var(--app-shadow-sm)',
                      backdropFilter: 'blur(6px)',
                    }}
                  >
                    {controls}
                  </div>
                )}
                {filtered.length === 0 ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <Text size="sm" c="var(--app-text-faint)">
                      {m.weaving_filter_empty()}
                    </Text>
                  </div>
                ) : null}
              </div>
              {title ? null : <WeaveDockedPanel />}
            </div>
            {/* Embedded: the weaving bar sits inside the preview card. Standalone
                hoists it to a sibling card UNDER the weave card (see the return). */}
            {building && !title ? <WeaveBar count={pieces.length} onOpenApp={onOpenApp} /> : null}
          </div>
        )}
      </div>
    </>
  )

  // Header-less mounts (in-builder preview / WeavingBuildPreview): fill the host
  // card as a bare canvas — filters float over the field, no page chrome.
  if (!title) {
    return (
      <div
        data-testid="weave-map"
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          color: 'var(--app-text)',
        }}
      >
        {body}
      </div>
    )
  }

  // Standalone Weave screen: one floating card on the canvas — the shared
  // ShellHeader as a top band, the woven field below it — matching every other
  // console page (PageContainer supplies the 8px gutter, raised card, radius,
  // shadow and header hairline the bare bar was missing). Filters live in the
  // header here, like the rest of the app. Clicking a piece opens its detail as
  // a SEPARATE card to the right of the weave card (a sibling on the canvas, not
  // a column inside it) — the panel carries its own gutter so the two read as
  // two floating cards side by side.
  // While the sandbox is still coming up there is no meta yet, so the header band
  // would carry a title over an empty field and filters with nothing to filter —
  // a bar of dead controls reads as a broken page rather than a loading one. Hold
  // the card (PanelCard is the same chrome minus the band) and let the breathing
  // mark be the whole surface until the first piece is woven.
  const preparing = loading && pieces.length === 0

  return (
    <div data-testid="weave-map" style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
        {preparing ? (
          <PanelCard>{body}</PanelCard>
        ) : (
          <PageContainer
            noPadding
            style={{ display: 'flex', flexDirection: 'column', color: 'var(--app-text)' }}
            header={<PageHeader title={title} actions={showFilters ? controls : undefined} />}
          >
            {body}
          </PageContainer>
        )}
        {/* The "Weaving your app / Go to app" bar as its own card UNDER the weave
            card (WeaveBar already carries card chrome). Its gutter has no top —
            the weave card's own 8px bottom supplies the 8px seam between them. */}
        {building ? (
          <div style={{ padding: phone ? 0 : '0 8px 8px 8px', flexShrink: 0 }}>
            <WeaveBar count={pieces.length} onOpenApp={onOpenApp} />
          </div>
        ) : null}
      </div>
      <WeaveDockedPanel standalone />
    </div>
  )
}
