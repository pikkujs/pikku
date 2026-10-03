import { type I18nNode } from '@pikku/react'

export type WeaveType =
  | 'function'
  | 'http'
  | 'page'
  | 'channel'
  | 'queue'
  | 'scheduler'
  | 'mcp'
  | 'workflow'
  | 'scenario'
  | 'agent'
  | 'email'
  | 'cli'
  | 'trigger'
  | 'addon'

export type WeavePiece = {
  id: string
  type: WeaveType
  name: string
  /** The raw verbose-meta item, handed to the OSS detail panel when clicked. */
  meta: Record<string, unknown>
}

export type WeaveLayout = 'radial' | 'graph'

/* ================================ root ================================ */
export type WeavingBuildProps = {
  /**
   * When set, the view owns a shared page header (title + filter controls in the
   * bar, like every other page) instead of floating the filters over the field.
   * The standalone Weave screen passes this; the in-builder mount omits it.
   */
  title?: I18nNode
  /**
   * Whether to show the type/tag/layout filter controls at all. Off for the
   * in-builder weaving view — it's a first-build animation, not a browsable map.
   */
  showFilters?: boolean
  /** Opens the running app (usually swaps this view for the live preview). */
  onOpenApp?: () => void
  /**
   * First-build gating (GH #260): the "Weaving / Go to app" bar is a first-build
   * affordance — show it only while the initial build is in progress. Once the app is
   * built the weave screen is just the woven field (normal nav reaches the app).
   * Defaults true so the in-builder weaving view keeps the bar.
   */
  building?: boolean
}
