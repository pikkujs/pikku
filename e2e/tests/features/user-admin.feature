@user-admin
Feature: Scaffolded user management

  Banning, deleting, signing out and password-setting are implemented by
  better-auth's `admin()` plugin, but pikku exposes them as scaffolded functions
  in the host app — no console required — each gated on its own
  `admin:users:*` scope.

  Those endpoints authorize on better-auth's own `user.role`, which pikku never
  grants directly: it is projected from the scope store at the session boundary.
  A caller holding a user-management scope is `role: 'admin'` to better-auth; a
  caller who is not, is not. That makes the scopes the single source of truth
  and these scenarios the proof that the projection actually reaches the plugin.

  The seed grants `admin@e2e.test` the umbrella `admin` scope directly, which
  covers every `admin:users:*` leaf by pikku's parent-grant rule.
  `guest@e2e.test` holds only `reports:read`, and `target@e2e.test` holds
  nothing and is what the destructive steps act on.

  Background:
    Given the API is available

  Scenario: A caller without the scope cannot ban
    When "guest@e2e.test" bans "target@e2e.test"
    Then the scope response status should be 403
    And the scope response should contain "MissingScopeError"
    And the scope response should contain "admin:users:ban"

  Scenario: A caller without the scope cannot delete
    When "guest@e2e.test" deletes "target@e2e.test"
    Then the scope response status should be 403
    And the scope response should contain "admin:users:remove"

  Scenario: A caller without the scope cannot revoke sessions
    When "guest@e2e.test" signs "target@e2e.test" out everywhere
    Then the scope response status should be 403
    And the scope response should contain "admin:users:sessions"

  Scenario: A caller without the scope cannot set a password
    When "guest@e2e.test" sets the password of "target@e2e.test" to "guest-set-password"
    Then the scope response status should be 403
    And the scope response should contain "admin:users:password"

  # The end-to-end proof of the projection: the ban only lands because the
  # caller's scopes made them `role: 'admin'` to better-auth's own gate.
  Scenario: A scoped caller bans a user, blocking sign-in, then lifts it
    When "admin@e2e.test" bans "target@e2e.test"
    Then the scope response status should be 200
    And "target@e2e.test" should not be able to sign in
    When "admin@e2e.test" unbans "target@e2e.test"
    Then the scope response status should be 200
    And "target@e2e.test" should be able to sign in

  Scenario: A scoped caller signs a user out everywhere
    When "admin@e2e.test" signs "target@e2e.test" out everywhere
    Then the scope response status should be 200

  # Reading the directory must not confer the power to change it: the role is
  # projected from the user-management subtree only, never from `users:list`.
  Scenario: Holding only the list scope does not confer ban
    When the scope "admin:users:list" is granted directly to "guest@e2e.test"
    And "guest@e2e.test" bans "target@e2e.test"
    Then the scope response status should be 403
    And the scope response should contain "admin:users:ban"
    When the direct scope "admin:users:list" is revoked from "guest@e2e.test"
