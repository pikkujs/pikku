import { useRef } from 'react'
import { usePanelContext } from '../../context/PanelContext'
import { PanelContainer } from '../panel/PanelContainer'
import { WorkflowProvider } from '../../context/WorkflowContext'
import { WEAVE_PANEL_WIDTH } from './internal'

export function WeaveDockedPanel({ standalone = false }: { standalone?: boolean } = {}) {
  const { panels, activePanel } = usePanelContext()
  const active = activePanel ? panels.get(activePanel) : null
  // Keep the last-viewed workflow's meta so a step panel opened from the
  // workflow's rendered flow still resolves its node via WorkflowProvider
  // (openWorkflowStep creates a separate panel carrying no workflow meta).
  const lastWorkflowMeta = useRef<unknown>(undefined)
  if (active?.data?.type === 'workflow') {
    lastWorkflowMeta.current = active.data.metadata
  }
  const workflow =
    active?.data?.type === 'workflow'
      ? active.data.metadata
      : active?.data?.type === 'workflowStep'
        ? lastWorkflowMeta.current
        : undefined
  const open = !!active

  // Standalone: a separate card beside the weave card. It owns the canvas gutter
  // (top/right/bottom 8px; no left — the weave card's own 8px right supplies the
  // 8px seam between them) and matches the page card's raised chrome/radius, so
  // the two read as two floating cards side by side. Embedded: an inline docked
  // column with a 12px inset, sitting inside the host preview card.
  return (
    <div
      style={{
        width: open ? (standalone ? WEAVE_PANEL_WIDTH + 8 : WEAVE_PANEL_WIDTH) : 0,
        marginLeft: standalone ? 0 : open ? 12 : 0,
        // Closed means GONE: with `box-sizing: border-box` a width of 0 still
        // reserves the gutter padding, so a closed standalone panel left an 8px
        // strip of its own raised card showing at the screen edge.
        paddingTop: standalone && open ? 8 : 0,
        paddingBottom: standalone && open ? 8 : 0,
        paddingRight: standalone && open ? 8 : 0,
        boxSizing: 'border-box',
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 180ms ease, margin-left 180ms ease, padding 180ms ease',
      }}
    >
      <div
        style={{
          width: WEAVE_PANEL_WIDTH,
          height: '100%',
          overflow: 'hidden',
          borderRadius: standalone ? 12 : 14,
          border: '1px solid var(--app-border)',
          background: standalone ? 'var(--app-panel-bg-raised)' : 'var(--app-panel-bg)',
          boxShadow: standalone ? 'var(--app-shadow-panel)' : 'var(--app-shadow-sm)',
        }}
      >
        <WorkflowProvider workflow={workflow}>
          <PanelContainer />
        </WorkflowProvider>
      </div>
    </div>
  )
}
