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
