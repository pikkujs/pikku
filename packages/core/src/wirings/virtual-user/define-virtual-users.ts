import type { CoreVirtualUsers } from './virtual-user-declaration.types.js'

/**
 * No-op function for declaring virtual users.
 * This exists purely for TypeScript type checking and will be tree-shaken.
 * The CLI extracts metadata via AST parsing and generates a `VirtualUserId` union
 * and a `virtual-users.gen.json` the console and `pikku virtual-user run` read off disk —
 * describing, listing or running one never has to load the app.
 *
 * Declaring is not running: a virtual user that exists only to be acted upon
 * (the account an admin bans, the colleague a document is shared with) is
 * seeded and never run.
 *
 * Exactly one `defineVirtualUsers(...)` is allowed per codebase, so there is one
 * place to read the cast from and one place to add to. A second call — even in
 * the same file — fails the build.
 *
 * @example
 * ```typescript
 * defineVirtualUsers({
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
export const defineVirtualUsers = (_config: CoreVirtualUsers): void => {}
