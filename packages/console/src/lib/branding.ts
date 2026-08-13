/**
 * The console's own identity, in one place.
 *
 * Two surfaces draw it — the nav dock's identity tile and the sidebar's home
 * link — and a white-labelled build overrides it through env vars, so resolving
 * it twice is how the two drift apart.
 */
const logoFile = (
  import.meta.env.VITE_CONSOLE_LOGO || 'pikku-console-logo.png'
).replace(/^\//, '')

export const consoleTitle: string =
  import.meta.env.VITE_CONSOLE_TITLE || 'Pikku Console'

export const consoleLogoSrc: string = import.meta.env.BASE_URL + logoFile

/** A single-colour mark needs inverting to stay visible on a dark plate. */
export const consoleLogoInvert: boolean =
  import.meta.env.VITE_CONSOLE_LOGO_INVERT === 'true'
