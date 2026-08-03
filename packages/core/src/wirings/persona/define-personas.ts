import type { CorePersonas } from './persona.types.js'

/**
 * No-op function for declaring personas.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `PersonaId` union
 * and a `personas.gen.json` the console and `pikku persona run` read off disk —
 * describing, listing or running one never has to load the app.
 *
 * `definePersonas` rather than `defineVirtualUsers` because declaring is not
 * running: a persona that exists only to be acted upon (the account an admin
 * bans, the colleague a document is shared with) is seeded and never run.
 *
 * Exactly one `definePersonas(...)` is allowed per codebase, so there is one
 * place to read the cast from and one place to add to. A second call — even in
 * the same file — fails the build.
 *
 * @example
 * ```typescript
 * definePersonas({
 *   susan: {
 *     name: 'Susan',
 *     jobTitle: 'Buys for a small café',
 *     roles: ['buyer'],
 *     personality: 'Hunts cheap deals. Tries three coupon codes before giving up.',
 *     goals: ['Get the weekly order in under five minutes'],
 *     disposition: 'careless',
 *     account: {},
 *   },
 * })
 * ```
 */
export const definePersonas = (_config: CorePersonas): void => {}
