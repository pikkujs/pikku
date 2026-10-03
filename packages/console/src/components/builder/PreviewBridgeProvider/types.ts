// A cosmetic presence selection, rendered in-iframe. The console stamps identity
// (userId/name/colour) and pushes the full set down; the iframe resolves each to a
// node and draws a labelled box. `mine` lets the iframe use its held node reference.
export type PresenceSelection = {
  userId: string
  name: string
  color: string
  omId: string
  omIndex: number
  mine: boolean
}

// Element-inspection mode, driven by the Design / i18n / chat buttons in the apps
// header. While a mode is active the preview turns plain clicks into element
// selections (design + chat) or translated-text picks (i18n); 'off' restores
// normal app interaction. 'chat' picks the same elements as 'design' but routes
// them into the Pi composer instead of the design panel — the preview only
// understands 'design'/'i18n'/'off', so setInspectMode maps 'chat' → 'design'.
export type InspectMode = 'off' | 'design' | 'i18n' | 'chat'
