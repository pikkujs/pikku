import { defineScope } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * What may be done in the newsroom.
 *
 * Note what is absent: there is no `posts:read` for the public. Reading a
 * published post is not a scope, because the reader has no session to hold one.
 * Anonymous access is expressed by a function being sessionless and deliberately
 * exposed — see wires/http/public.http.ts — not by granting a scope to nobody.
 *
 * Every scope here is therefore about the *editorial* side, where there is a
 * person to attach it to.
 */
// @snippet start defineScopes
defineScope({
  posts: {
    displayName: 'Posts',
    description: 'Writing and editing',
    scopes: {
      read: { description: 'See drafts and scheduled posts, not just published' },
      write: { description: 'Write and edit posts' },
      publish: { description: 'Publish, schedule and unpublish' },
    },
  },
  tags: {
    displayName: 'Tags',
    description: 'The taxonomy',
    scopes: {
      write: { description: 'Create and rename tags' },
    },
  },
  analytics: {
    displayName: 'Analytics',
    description: 'Readership',
    scopes: {
      read: { description: 'See view counts' },
    },
  },
})
// @snippet end defineScopes
