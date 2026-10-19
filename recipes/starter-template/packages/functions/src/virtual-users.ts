/**
 * The people this app is for, and the people its scenarios run as.
 *
 * One `defineVirtualUsers` call for the whole project — codegen builds the
 * `VirtualUserId` union from it, materialises one scenario virtual user per person, and
 * seeds a user row each, so a second call site would be a second answer to
 * "who uses this app".
 *
 * `visitor` is a PLACEHOLDER for a project with no roles yet. REPLACE it with this
 * app's real people — do not add yours beside it. Declaration order is the ranking,
 * so a leftover `visitor` sorts first and every consumer that takes the first virtual user
 * (the vision critic) treats a synthetic health-check user
 * as the person this app is for. Declare the primary role — the one who uses the app
 * daily, not the one who administers it — FIRST.
 *
 * Replacing it means four edits in one pass, listed in AGENTS.md: this file,
 * `pikku.config.json`, and the two shipped scenarios that name `virtualUsers.visitor`
 * literally. PKU677 requires a browser step's virtual user to be a literal `virtualUsers.<name>`,
 * so those two cannot pick one dynamically — rename the virtual user without editing them
 * and `virtualUsers.visitor` stops type-checking, which fails `pikku all`, and a failed type
 * check means nothing you write afterwards registers at all.
 *
 * Addresses are never written down: each is derived from the virtual user id and
 * `scenarios.emailDomain` in pikku.config.json, so `visitor` signs in as
 * visitor@virtualuser.local. Writing one by hand is how a run signs in as somebody
 * who was never created.
 */
import { defineVirtualUsers } from '#pikku/scopes/pikku-virtual-users.gen.js'

defineVirtualUsers({
  visitor: {
    name: 'Visitor',
    jobTitle: 'Synthetic health-check user',
    personality:
      'Signs in and checks their own session — proves auth end to end',
    account: {},
  },
})
