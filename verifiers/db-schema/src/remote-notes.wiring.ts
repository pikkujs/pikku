/**
 * A second addon, wired remotely, which must contribute nothing to this
 * project's schema.
 *
 * It publishes a `notes` table through the same `pikku db export` channel the
 * local addon uses, so the artifact `db generate` would read is there and is
 * real — the only thing saying "not yours" is this declaration. `wireRemoteAddon`
 * means the handlers run on the host at `serverUrl`, against the host's
 * database; folding `notes` into this project's migrations would create a table
 * nothing here uses, in the wrong database, and put a second authority on a
 * schema that host's own migrations own.
 *
 * Nothing calls it, and nothing needs to: the claim under test is about what
 * `db generate` writes, and the host does not have to exist for the declaration
 * to be wrong to act on.
 */
import { wireRemoteAddon } from '#pikku/function'

wireRemoteAddon({
  name: 'notes',
  package: '@pikku/verifier-db-remote-addon',
  serverUrl: 'http://localhost:9999',
})
