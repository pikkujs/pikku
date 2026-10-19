import { defineSystemRole } from '#pikku/scopes/pikku-scope-types.gen.js'

/**
 * Who may do it.
 *
 * The interesting pair is `operator` and `builder`. An operator keeps the
 * platform running — watches runs, cancels a stuck one, replays a failure —
 * without being able to change what any flow does. A builder does the
 * opposite. Most incidents are handled by the first and caused by the second,
 * which is a good argument for not giving one person both by default.
 *
 * Removing a role here does not revoke it: the row stays, marked undeclared and
 * inert, until `pikku roles prune`.
 */
// @snippet start defineRoles
defineSystemRole({
  /**
   * Reads everything, changes nothing. The role to hand somebody who is
   * debugging a flow they do not own.
   */
  viewer: {
    displayName: 'Viewer',
    description: 'See flows and runs without touching either',
    scopes: ['flows:read', 'runs:read', 'connections:read'],
  },
  /**
   * Holds `runs:cancel` and `runs:replay` but no `flows:write` — can stop the
   * bleeding at 3am without being able to edit the flow that caused it. That
   * separation is the point: incident response and authorship are different
   * jobs, and conflating them is how a fix at 3am becomes an outage at 9am.
   */
  operator: {
    displayName: 'Operator',
    description: 'Keep flows running: cancel, replay, reconnect',
    scopes: ['flows:read', 'flows:run', 'runs', 'connections'],
  },
  builder: {
    displayName: 'Builder',
    description: 'Author and publish flows',
    scopes: ['flows', 'runs:read', 'connections:read'],
  },
  /**
   * `pikku:console` comes from the console addon, and `virtualUser` from the
   * virtual-user scaffold, whose RPCs no role could otherwise reach. Parents
   * are granted rather than `virtualUser:*`: a wildcard has no row in
   * pikku_scopes for pikku_role_scopes to reference.
   */
  admin: {
    displayName: 'Administrator',
    description: 'Everything, plus console administration',
    scopes: ['flows', 'runs', 'connections', 'pikku:console', 'virtualUser'],
  },
})
// @snippet end defineRoles
