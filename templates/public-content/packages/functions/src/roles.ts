import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it.
 *
 * There is deliberately no `reader` role. A reader is anonymous — they have no
 * account, no session and therefore no role — and inventing one would suggest
 * the public read is gated when it is not.
 *
 * The split that matters is `author` and `editor`. An author writes and cannot
 * publish; an editor can. That is not bureaucracy: publishing is the
 * irreversible step in this product, because the moment a post is public it has
 * been seen, and unpublishing does not unsee it.
 */
// @snippet start defineRoles
defineSystemRole({
  author: {
    displayName: 'Author',
    description: 'Write and edit posts, including drafts nobody else can see',
    scopes: ['posts:read', 'posts:write'],
  },
  /**
   * Holds `posts:publish`, which authors do not. The one-way door gets its own
   * scope so that "who can make something public" is answerable from the role
   * declaration rather than by reading a function body.
   */
  editor: {
    displayName: 'Editor',
    description: 'Everything an author can do, plus publishing and scheduling',
    scopes: ['posts', 'tags:write', 'analytics:read'],
  },
  admin: {
    displayName: 'Administrator',
    description: 'Everything, plus console administration',
    scopes: ['posts', 'tags', 'analytics', 'pikku:console', 'virtualUser'],
  },
})
// @snippet end defineRoles
