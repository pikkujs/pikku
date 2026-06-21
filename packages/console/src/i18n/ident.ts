// Single source of truth for turning an i18next dotted key (`landing.cards.x`)
// into a Paraglide snake_case message identifier (`landing_cards_x`). Used by the
// runtime resolver `mKey` for the unavoidable dynamic cases.
export const identOf = (dotPath: string): string =>
  dotPath
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[.\-\s]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
