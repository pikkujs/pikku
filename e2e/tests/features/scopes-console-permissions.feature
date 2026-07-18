@scopes-console @console-staff
Feature: Scopes page permission handling

  The scope RPCs are self-hosting: reading roles or the vocabulary itself
  requires the `pikku:scopes:read` scope. A console admin without it — here
  staff@e2e.test, who passes the console AuthGate but holds no scope role — must
  see a clear permission message, not the misleading "the scope service may be
  unavailable" error that a real outage would produce.

  Background:
    Given the API is available

  Scenario: A console admin without pikku:scopes:read sees a permission message, not an outage
    When I navigate to the scopes page
    Then I should see a permission-denied message for roles
    And I should not see a service-unavailable message
