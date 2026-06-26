@impersonation @console
Feature: Scoped user impersonation in the console

  Impersonating a user overlays only execution surfaces (workflows/agents/apis).
  The console chrome keeps running as the signed-in admin.

  Background:
    Given the API is available

  Scenario: Impersonation scopes to execution, not the console chrome
    When I open the users page in the console
    Then I should see the user "guest@e2e.test" in the users list
    When I impersonate the user "guest@e2e.test"
    Then the impersonation banner should show "guest@e2e.test"
    When I search the users list for "admin@e2e.test"
    Then I should see the user "admin@e2e.test" in the users list
    And no console chrome request should carry the impersonation header
    When I start a "dslSequentialWorkflow" run from the console
    Then the workflow start request should carry the impersonation header
    When I stop impersonating
    Then the impersonation banner should not be shown
