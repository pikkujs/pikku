@scopes-console @console
Feature: Managing scopes and roles in the console

  The console's Scopes page renders the declared scope vocabulary and the roles
  composed from it, and the Users page assigns roles per user. Every read and
  write goes through the addon-console scope RPCs, which are themselves gated by
  `pikku:scopes:*` — so only an admin holding those scopes reaches this UI.

  Background:
    Given the API is available

  Scenario: The declared vocabulary and seeded roles are visible
    When I open the scopes page in the console
    Then I should see the role "console-admin"
    And I should see the role "report-viewer"
    When I view the scope vocabulary
    Then I should see the declared scope "pikku:scopes:manage"
    And I should see the declared scope "reports:read"

  Scenario: Creating a role from the declared scopes
    When I open the scopes page in the console
    And I create a role "billing-viewer" granting the "Read reports" scope
    Then I should see the role "billing-viewer"

  Scenario: Saving a role with no name surfaces a validation error, not a dead button
    When I open the scopes page in the console
    And I try to save a new role without a name
    Then I should see the role name required error

  Scenario: Assigning a role resolves its scopes onto the user
    When I open the roles drawer for "guest@e2e.test"
    Then the user should hold the role "report-viewer"
    And the user's resolved scopes should include "reports:read"
    When I add the role "console-admin" to the user
    Then the user's resolved scopes should include "pikku:scopes:manage"
    When I remove the role "console-admin" from the user
    Then the user should not hold the role "console-admin"

  # A scope can be granted to a user directly, outside of any role. The grant is
  # revoked again so the admin is left in its seeded state.
  Scenario: Granting and revoking a scope directly on a user
    When I open the roles drawer for "admin@e2e.test"
    And I grant the scope "Read reports" directly to the user
    Then the user should hold the direct scope "Read reports"
    When I revoke the direct scope "Read reports" from the user
    Then the user should not hold the direct scope "Read reports"

  # A keyboard-only admin must be able to open a role for editing — the row is a
  # real button, not a mouse-only click target.
  Scenario: A role can be opened for editing from the keyboard
    When I open the scopes page in the console
    And I open the role "console-admin" with the keyboard
    Then I should see the edit drawer for the role "console-admin"

  # Search and the create action live in the page header, like every other list
  # page. Filtering roles from the header narrows the list, and switching tabs
  # resets the query so it never leaks across surfaces.
  Scenario: Roles are filtered from the page-header search, which clears on tab switch
    When I open the scopes page in the console
    Then the create-role action and search live in the page header
    When I search the roles for "report-viewer"
    Then I should see the role "report-viewer"
    And I should not see the role "console-admin"
    When I view the scope vocabulary
    And I return to the roles tab
    Then I should see the role "console-admin"
    And the roles search box should be empty

  # The read-only scope vocabulary must not advertise clickability it does not have.
  Scenario: Scope vocabulary rows are not interactive
    When I open the scopes page in the console
    And I view the scope vocabulary
    Then the scope "reports:read" should not be an interactive row
