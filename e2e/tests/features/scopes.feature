@scopes
Feature: Scope gate on functions

  A function declaring `scopes: ['reports:read']` is an AND gate resolved from
  the session at the boundary, before the body is even parsed. A caller holding
  the scope passes; an authenticated caller without it is refused with a 403
  MissingScopeError that names the missing scope. Scopes narrow, never widen:
  no passing permission or admin role can substitute for the declared scope.

  The e2e seed grants `report-viewer` (reports:read) to guest@e2e.test and
  `console-admin` (pikku:scopes:*) to admin@e2e.test — so the admin is the
  authenticated-but-unscoped caller for the reports gate.

  Background:
    Given the API is available

  Scenario: A caller holding the scope reaches the function
    When I call "getReport" as "guest@e2e.test"
    Then the scope response status should be 200
    And the scope response should contain "quarterly numbers"

  Scenario: An authenticated caller without the scope is refused
    When I call "getReport" as "admin@e2e.test"
    Then the scope response status should be 403
    And the scope response should contain "MissingScopeError"
    And the scope response should contain "reports:read"

  # A scope granted directly to a user — with no role involved — resolves onto
  # their session at the boundary and opens the gate on the next request, no
  # re-login. Revoking it closes the gate again. The scenario leaves the admin
  # back at its seeded (unscoped-for-reports) state.
  Scenario: A scope granted directly to a user opens the gate without a role
    When I call "getReport" as "admin@e2e.test"
    Then the scope response status should be 403
    When the scope "reports:read" is granted directly to "admin@e2e.test"
    And I call "getReport" as "admin@e2e.test"
    Then the scope response status should be 200
    And the scope response should contain "quarterly numbers"
    When the direct scope "reports:read" is revoked from "admin@e2e.test"
    And I call "getReport" as "admin@e2e.test"
    Then the scope response status should be 403
